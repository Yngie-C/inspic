import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { countWords, isChapterHtmlTooLong } from "@/lib/content-stats";
import {
  BOOK_LANGUAGES,
  INVALID_BODY_MESSAGE,
  isOneOf,
  readBookTitle,
} from "@/lib/authoring-input";
import {
  syncChapterWorkbookBlocks,
  type WorkbookSyncResult,
} from "@/lib/workbook/sync-blocks";
import { countWorkbookBlockElements } from "@/lib/workbook/extract-blocks";
import {
  SIZE_LIMITS,
  SOURCE_TYPE_BY_EXTENSION,
  parseUpload,
  resolveExtension,
  titleFromFileName,
  type ParsedChapter,
} from "@/lib/upload-parser";

/**
 * 원고 업로드 → 책 1권 + 챕터 N개.
 *
 * 파싱은 `lib/upload-parser.ts`에 있습니다. 이 라우트가 하는 일은
 * 입력 검증과 저장입니다.
 */

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError("파일을 읽지 못했어요. 다시 올려 주세요.", "UPLOAD_ERROR", 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return apiError("올릴 파일을 골라 주세요.", "UPLOAD_ERROR", 400);
  }

  const fileName =
    file instanceof File ? file.name : (textField(formData, "filename") ?? "upload");

  const ext = resolveExtension(file.type || "", fileName);
  if (!ext) {
    return apiError(
      ".txt, .md, .docx 파일만 올릴 수 있어요.",
      "UPLOAD_ERROR",
      415,
    );
  }

  const limit = SIZE_LIMITS[ext];
  if (file.size > limit) {
    return apiError(
      `.${ext} 파일은 ${limit / (1024 * 1024)}MB까지 올릴 수 있어요.`,
      "UPLOAD_ERROR",
      413,
    );
  }

  // 폼 필드는 문자열이 아니라 파일 파트로 올 수도 있습니다. 그대로 `.trim()`을
  // 부르면 던져서 500이 됩니다(5-P2-3).
  const title = readBookTitle(
    textField(formData, "title")?.trim() || titleFromFileName(fileName),
  );
  if (!title.ok) return apiError(title.message, "VALIDATION_ERROR", 400);

  const description = textField(formData, "description")?.trim() || null;
  const language = textField(formData, "language")?.trim() || "ko";
  if (!isOneOf(BOOK_LANGUAGES, language)) {
    return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
  }

  let chapters: ParsedChapter[];
  try {
    chapters = await parseUpload(file, ext);
  } catch (err) {
    console.error("[upload] 원고를 해석하지 못했습니다", { ext, err });
    return apiError(
      "원고를 읽지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.",
      "UPLOAD_ERROR",
      422,
    );
  }

  if (chapters.length === 0) {
    return apiError("원고에 내용이 없어요.", "UPLOAD_ERROR", 422);
  }

  // `chapters.content_html`의 CHECK 제약에 걸리면 Postgres 원문이 담긴 500이
  // 됩니다. 장 구분이 없는 긴 원고나 이미지가 든 docx(base64로 본문에 들어옴)가
  // 그렇습니다. 어느 장이 넘쳤는지 알려 줍니다(5-P1-6).
  const tooLong = chapters.findIndex((chapter) =>
    isChapterHtmlTooLong(chapter.content_html),
  );
  if (tooLong !== -1) {
    return apiError(
      `${tooLong + 1}번째 장 "${chapters[tooLong].title}"이 너무 길어 올리지 못했어요. ` +
        "장마다 제목(헤딩)을 넣어 나누거나, 원고 속 이미지를 빼고 올린 뒤 편집 화면에서 이미지 버튼으로 넣어 주세요.",
      "CONTENT_TOO_LONG",
      400,
    );
  }

  const supabase = await createClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .insert({
      owner_id: user.id,
      title: title.value,
      description,
      language,
      source_type: SOURCE_TYPE_BY_EXTENSION[ext],
      status: "draft",
      visibility: "private",
    })
    .select()
    .single();

  if (bookError || !book) {
    console.error("[upload] 책을 만들지 못했습니다", { bookError });
    return apiError(SAVE_FAILED_MESSAGE, "SERVER_ERROR", 500);
  }

  // 책의 장 수·글자 수는 장을 넣을 때 DB 트리거가 셉니다(00009). 장은
  // 상태를 주지 않아 published(기본값)로 들어갑니다 — 책이 draft·private이라
  // 독자에게는 출간 전까지 보이지 않습니다.
  const uploadedAt = Date.now();
  const chapterRows = chapters.map((chapter, index) => ({
    book_id: book.id,
    title: chapter.title,
    slug: `chapter-${index + 1}-${uploadedAt}-${index}`,
    order_index: index,
    content_html: chapter.content_html,
    content_raw: chapter.content_raw || null,
    word_count: countWords(chapter.content_html),
  }));

  const { data: createdChapters, error: chaptersError } = await supabase
    .from("chapters")
    .insert(chapterRows)
    .select("id, title, order_index, word_count, content_html, content_raw");

  if (chaptersError || !createdChapters) {
    console.error("[upload] 장을 만들지 못했습니다", { bookId: book.id, chaptersError });
    // 장 없는 빈 책이 남지 않게 지웁니다.
    await supabase.from("books").delete().eq("id", book.id);
    return apiError(SAVE_FAILED_MESSAGE, "SERVER_ERROR", 500);
  }

  // 원고에 워크북 블록이 인라인 HTML로 들어 있을 수 있습니다 (마크다운의
  // <section data-template-type=...>). 갓 만든 챕터라 지울 정의가 없으므로
  // 블록이 있는 챕터만 부릅니다 — 챕터 수만큼 RPC를 동시에 던지면 원고가
  // 길 때 커넥션이 몰립니다. 결과는 장 저장과 같이 응답에 싣습니다(5-P2-4).
  const workbookSync: Array<{ chapter_id: string } & WorkbookSyncResult> = [];
  for (const chapter of createdChapters) {
    if (countWorkbookBlockElements(chapter.content_html) === 0) continue;
    const result = await syncChapterWorkbookBlocks(
      supabase,
      chapter.id,
      chapter.content_html,
    );
    workbookSync.push({ chapter_id: chapter.id, ...result });
  }

  // 본문 전체를 돌려보내지 않습니다. 업로드 화면은 장 목록과 앞부분만 보여 줍니다.
  const chapterSummaries = [...createdChapters]
    .sort((a, b) => a.order_index - b.order_index)
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      order_index: chapter.order_index,
      word_count: chapter.word_count,
      preview: chapterPreview(chapter.content_raw, chapter.title),
    }));

  return apiSuccess(
    { book, chapters: chapterSummaries, workbook_sync: workbookSync },
    201,
  );
}

const SAVE_FAILED_MESSAGE = "원고를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.";

/** 문자열 필드만 읽습니다. 없거나 파일 파트면 null. */
function textField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

/** 장 목록에 보여 줄 앞부분. 제목으로 시작하면 제목은 뺍니다. */
function chapterPreview(contentRaw: string | null, title: string): string {
  const text = (contentRaw ?? "").replace(/\s+/g, " ").trim();
  const body = text.startsWith(title) ? text.slice(title.length).trim() : text;
  return body.slice(0, PREVIEW_LENGTH);
}

const PREVIEW_LENGTH = 80;
