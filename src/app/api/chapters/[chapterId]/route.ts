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
  isOrderIndex,
  readChapterTitle,
} from "@/lib/authoring-input";
import { isUuid } from "@/lib/template-node-id";
import { syncChapterWorkbookBlocks } from "@/lib/workbook/sync-blocks";

type Params = { params: Promise<{ chapterId: string }> };

const CHAPTER_NOT_FOUND = "장을 찾을 수 없어요.";

export async function GET(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const { chapterId } = await params;
  if (!isUuid(chapterId)) return apiError(CHAPTER_NOT_FOUND, "NOT_FOUND", 404);

  const supabase = await createClient();

  const { data: chapter, error } = await supabase
    .from("chapters")
    .select("*")
    .eq("id", chapterId)
    .single();

  if (error || !chapter) return apiError(CHAPTER_NOT_FOUND, "NOT_FOUND", 404);

  // Verify access via book
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("owner_id, visibility")
    .eq("id", chapter.book_id)
    .single();

  if (bookError || !book) return apiError("책을 찾을 수 없어요.", "NOT_FOUND", 404);
  if (book.owner_id !== user.id && book.visibility === "private") {
    return apiError("이 장을 볼 수 없어요.", "FORBIDDEN", 403);
  }

  // Non-owners cannot access draft chapters
  if (book.owner_id !== user.id && chapter.status === "draft") {
    return apiError(CHAPTER_NOT_FOUND, "NOT_FOUND", 404);
  }

  return apiSuccess(chapter);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const { chapterId } = await params;
  if (!isUuid(chapterId)) return apiError(CHAPTER_NOT_FOUND, "NOT_FOUND", 404);

  const body = await readJsonObject(request);
  if (!body) return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);

  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = readChapterTitle(body.title);
    if (!title.ok) return apiError(title.message, "VALIDATION_ERROR", 400);
    updates.title = title.value;
  }
  if (body.order_index !== undefined) {
    if (!isOrderIndex(body.order_index)) {
      return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
    }
    updates.order_index = body.order_index;
  }
  if (body.content_raw !== undefined) {
    if (body.content_raw !== null && typeof body.content_raw !== "string") {
      return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
    }
    updates.content_raw = body.content_raw;
  }
  // 모르는 상태를 조용히 무시하면 저자는 공개한 줄 압니다.
  // published_at은 DB 트리거가 찍습니다(00009).
  if (body.status !== undefined) {
    if (!isChapterStatus(body.status)) {
      return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
    }
    updates.status = body.status;
  }

  let sanitizedHtml: string | null = null;
  if (body.content_html !== undefined) {
    if (typeof body.content_html !== "string") {
      return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
    }
    sanitizedHtml = sanitizeContent(body.content_html);
    if (isChapterHtmlTooLong(sanitizedHtml)) {
      return apiError(CHAPTER_TOO_LONG_MESSAGE, "CONTENT_TOO_LONG", 400);
    }
    updates.content_html = sanitizedHtml;
    updates.word_count = countWords(sanitizedHtml);
  }

  if (Object.keys(updates).length === 0) {
    return apiError("바꿀 내용이 없어요.", "VALIDATION_ERROR", 400);
  }

  const supabase = await createClient();

  const { data: chapter, error: fetchError } = await supabase
    .from("chapters")
    .select("id, book_id, books(owner_id)")
    .eq("id", chapterId)
    .single();

  if (fetchError || !chapter) return apiError(CHAPTER_NOT_FOUND, "NOT_FOUND", 404);

  const book = chapter.books as unknown as { owner_id: string } | null;
  if (!book) return apiError("책을 찾을 수 없어요.", "NOT_FOUND", 404);
  if (book.owner_id !== user.id) {
    return apiError("이 장을 고칠 수 없어요.", "FORBIDDEN", 403);
  }

  // 책의 장 수·글자 수는 DB 트리거가 published 장 기준으로 다시 셉니다
  // (00009). 여기서 읽은 값에 차이를 더해 덮으면 동시 저장에서 갱신을
  // 잃습니다.
  const { data, error } = await supabase
    .from("chapters")
    .update(updates)
    .eq("id", chapterId)
    .select()
    .single();

  if (error || !data) {
    console.error("[chapters] 장을 저장하지 못했습니다", { chapterId, error });
    return apiError("저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }

  // 본문이 바뀌었으면 블록 정의를 다시 맞춥니다. 방금 쓴 본문 그대로
  // 넘겨야 RPC가 지금 DB의 본문과 대조할 수 있습니다 — 그 사이 다른
  // 저장이 끼었으면 이 동기화는 건너뛰고(stale), 끼어든 쪽이 맞춥니다.
  const workbookSync =
    sanitizedHtml === null
      ? null
      : await syncChapterWorkbookBlocks(supabase, chapterId, sanitizedHtml);

  return apiSuccess({ ...data, workbook_sync: workbookSync });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const { chapterId } = await params;
  if (!isUuid(chapterId)) return apiError(CHAPTER_NOT_FOUND, "NOT_FOUND", 404);

  const supabase = await createClient();

  const { data: chapter, error: fetchError } = await supabase
    .from("chapters")
    .select("id, books(owner_id)")
    .eq("id", chapterId)
    .single();

  if (fetchError || !chapter) return apiError(CHAPTER_NOT_FOUND, "NOT_FOUND", 404);

  const book = chapter.books as unknown as { owner_id: string } | null;
  if (!book) return apiError("책을 찾을 수 없어요.", "NOT_FOUND", 404);
  if (book.owner_id !== user.id) {
    return apiError("이 장을 지울 수 없어요.", "FORBIDDEN", 403);
  }

  // 독자 답은 남습니다(chapter_id ON DELETE SET NULL, 00008). 책의 장 수·
  // 글자 수는 DB 트리거가 맞춥니다(00009).
  const { error } = await supabase.from("chapters").delete().eq("id", chapterId);
  if (error) {
    console.error("[chapters] 장을 지우지 못했습니다", { chapterId, error });
    return apiError("장을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }

  return apiSuccess({ deleted: true });
}
