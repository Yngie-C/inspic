import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { countWords } from "@/lib/content-stats";
import { syncChapterWorkbookBlocks } from "@/lib/workbook/sync-blocks";
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
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError("Expected multipart/form-data", "UPLOAD_ERROR", 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return apiError("No file provided in form field 'file'", "UPLOAD_ERROR", 400);
  }

  const fileName =
    file instanceof File
      ? file.name
      : ((formData.get("filename") as string) ?? "upload");

  const ext = resolveExtension(file.type || "", fileName);
  if (!ext) {
    return apiError(
      "Unsupported file type. Allowed: .txt, .md, .docx",
      "UPLOAD_ERROR",
      415,
    );
  }

  const limit = SIZE_LIMITS[ext];
  if (file.size > limit) {
    return apiError(
      `File too large. Limit for .${ext} is ${limit / (1024 * 1024)}MB`,
      "UPLOAD_ERROR",
      413,
    );
  }

  const bookTitle =
    (formData.get("title") as string | null)?.trim() ||
    titleFromFileName(fileName);
  const description = (formData.get("description") as string | null)?.trim() ?? null;
  const language = (formData.get("language") as string | null)?.trim() ?? "ko";

  let chapters: ParsedChapter[];
  try {
    chapters = await parseUpload(file, ext);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse file";
    return apiError(`File parsing failed: ${message}`, "UPLOAD_ERROR", 422);
  }

  if (chapters.length === 0) {
    return apiError("No content found in file", "UPLOAD_ERROR", 422);
  }

  const supabase = await createClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .insert({
      owner_id: user.id,
      title: bookTitle,
      description,
      language,
      source_type: SOURCE_TYPE_BY_EXTENSION[ext],
      status: "draft",
      visibility: "private",
    })
    .select()
    .single();

  if (bookError) return apiError(bookError.message, "SERVER_ERROR", 500);

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
    .select();

  if (chaptersError) {
    // Rollback book creation
    await supabase.from("books").delete().eq("id", book.id);
    return apiError(chaptersError.message, "SERVER_ERROR", 500);
  }

  // 원고에 워크북 블록이 인라인 HTML로 들어 있을 수 있습니다 (마크다운의
  // <section data-template-type=...>). 갓 만든 챕터라 지울 정의가 없으므로
  // 블록이 있는 챕터만 부릅니다 — 챕터 수만큼 RPC를 동시에 던지면 원고가
  // 길 때 커넥션이 몰립니다.
  for (const chapter of createdChapters ?? []) {
    if (countWorkbookBlockElements(chapter.content_html) === 0) continue;
    await syncChapterWorkbookBlocks(supabase, chapter.id, chapter.content_html);
  }

  return apiSuccess({ book, chapters: createdChapters }, 201);
}
