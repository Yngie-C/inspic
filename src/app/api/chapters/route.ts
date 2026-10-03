import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAuthUser,
  apiError,
  apiSuccess,
  readJsonObject,
} from "@/lib/api-utils";
import { sanitizeContent } from "@/lib/sanitize";
import {
  CHAPTER_TOO_LONG_MESSAGE,
  countWords,
  isChapterHtmlTooLong,
} from "@/lib/content-stats";
import {
  INVALID_BODY_MESSAGE,
  isChapterStatus,
  readChapterTitle,
} from "@/lib/authoring-input";
import { isUuid } from "@/lib/template-node-id";
import { syncChapterWorkbookBlocks } from "@/lib/workbook/sync-blocks";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get("bookId");

  if (!bookId || !isUuid(bookId)) {
    return apiError("책을 찾을 수 없어요.", "VALIDATION_ERROR", 400);
  }

  const supabase = await createClient();

  // Verify book access
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("owner_id, visibility")
    .eq("id", bookId)
    .single();

  if (bookError || !book) return apiError("책을 찾을 수 없어요.", "NOT_FOUND", 404);
  if (book.owner_id !== user.id && book.visibility === "private") {
    return apiError("이 책을 볼 수 없어요.", "FORBIDDEN", 403);
  }

  const isOwner = book.owner_id === user.id;
  // 같은 order_index가 둘 있어도 순서가 요청마다 흔들리지 않게, 미리보기
  // 장을 고르는 book_preview_chapter_id()와 같은 기준으로 정렬합니다.
  let chaptersQuery = supabase
    .from("chapters")
    .select("*")
    .eq("book_id", bookId)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (!isOwner) {
    chaptersQuery = chaptersQuery.eq("status", "published");
  }

  const { data, error } = await chaptersQuery;

  if (error) {
    console.error("[chapters] 장 목록을 불러오지 못했습니다", { bookId, error });
    return apiError("장 목록을 불러오지 못했어요.", "SERVER_ERROR", 500);
  }

  return apiSuccess(data ?? []);
}

/**
 * 장을 만듭니다.
 *
 * 순서(`order_index`)는 서버가 정합니다 — 맨 뒤. 클라이언트가 보내던
 * `chapters.length`는 중간 장을 지운 뒤 기존 장과 겹쳤습니다(4-P1-14).
 *
 * 상태를 보내지 않으면 책 상태를 따릅니다(2026-10-02 결정). 출간된 책에
 * 더한 장은 `draft`라 저자가 공개하기 전까지 독자에게 보이지 않습니다 —
 * 예전에는 "장 추가"를 누르는 순간 빈 "새 장"이 구매자 목차에 떴습니다
 * (4-P1-9). 출간 전 책은 어차피 독자에게 보이지 않으므로 `published`로
 * 두어, 처음 출간할 때 장마다 공개를 누르지 않아도 되게 합니다.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const body = await readJsonObject(request);
  if (!body) return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);

  const { book_id, content_html, content_raw, status } = body;

  if (typeof book_id !== "string" || !isUuid(book_id)) {
    return apiError("책을 찾을 수 없어요.", "VALIDATION_ERROR", 400);
  }
  const title = readChapterTitle(body.title);
  if (!title.ok) return apiError(title.message, "VALIDATION_ERROR", 400);
  if (typeof content_html !== "string") {
    return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
  }
  if (content_raw !== undefined && content_raw !== null && typeof content_raw !== "string") {
    return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
  }
  if (status !== undefined && !isChapterStatus(status)) {
    return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
  }

  const sanitized = sanitizeContent(content_html);
  if (isChapterHtmlTooLong(sanitized)) {
    return apiError(CHAPTER_TOO_LONG_MESSAGE, "CONTENT_TOO_LONG", 400);
  }

  const supabase = await createClient();

  // Verify book ownership
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("owner_id, status")
    .eq("id", book_id)
    .single();

  if (bookError || !book) return apiError("책을 찾을 수 없어요.", "NOT_FOUND", 404);
  if (book.owner_id !== user.id) {
    return apiError("이 책을 고칠 수 없어요.", "FORBIDDEN", 403);
  }

  const { data: last, error: lastError } = await supabase
    .from("chapters")
    .select("order_index")
    .eq("book_id", book_id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) {
    console.error("[chapters] 마지막 장 순서를 읽지 못했습니다", { book_id, lastError });
    return apiError("장을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }

  const order_index = typeof last?.order_index === "number" ? last.order_index + 1 : 0;
  const resolvedStatus =
    status ?? (book.status === "published" ? "draft" : "published");

  // published_at과 책의 장 수·글자 수는 DB 트리거가 맞춥니다(00009).
  const { data: chapter, error: insertError } = await supabase
    .from("chapters")
    .insert({
      book_id,
      title: title.value,
      slug: `chapter-${order_index + 1}-${Date.now()}`,
      order_index,
      content_html: sanitized,
      content_raw: content_raw ?? null,
      word_count: countWords(sanitized),
      status: resolvedStatus,
    })
    .select()
    .single();

  if (insertError || !chapter) {
    console.error("[chapters] 장을 만들지 못했습니다", { book_id, insertError });
    return apiError("장을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }

  const workbookSync = await syncChapterWorkbookBlocks(
    supabase,
    chapter.id,
    sanitized,
  );

  return apiSuccess({ ...chapter, workbook_sync: workbookSync }, 201);
}
