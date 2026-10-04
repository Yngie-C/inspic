import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAuthUser,
  apiError,
  apiSuccess,
  readJsonObject,
} from "@/lib/api-utils";
import { sanitizeContent } from "@/lib/sanitize";
import { removeChapterImages } from "@/lib/storage-cleanup";
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
import type { ChapterStatus } from "@/types";
import { syncChapterWorkbookBlocks } from "@/lib/workbook/sync-blocks";
import { loadPublishChecks } from "@/lib/publish-checks-loader";
import { blockers, type PublishCheck } from "@/lib/publish-checks";

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
  //
  // 상태는 따로 바꿉니다. 출간된 책에서는 공개 전환이 검수를 거치는데,
  // 본문과 함께 오면 검수가 저장 전 본문과 저장 전 블록 정의를 봅니다.
  if (body.status !== undefined) {
    if (!isChapterStatus(body.status)) {
      return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
    }
    if (Object.keys(body).some((key) => key !== "status")) {
      return apiError("공개 상태는 따로 바꿔 주세요.", "VALIDATION_ERROR", 400);
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
    .select("id, book_id, status, books(owner_id, published_at)")
    .eq("id", chapterId)
    .single();

  if (fetchError || !chapter) return apiError(CHAPTER_NOT_FOUND, "NOT_FOUND", 404);

  const book = chapter.books as unknown as {
    owner_id: string;
    published_at: string | null;
  } | null;
  if (!book) return apiError("책을 찾을 수 없어요.", "NOT_FOUND", 404);
  if (book.owner_id !== user.id) {
    return apiError("이 장을 고칠 수 없어요.", "FORBIDDEN", 403);
  }

  // 한 번이라도 출간한 책에서는 장의 공개 전환이 곧 독자 화면의 변화입니다
  // — 공개를 거둔 뒤에도 산 독자는 published 장을 계속 읽습니다(00006).
  // 그래서 책을 공개할 때와 같은 검수를 거칩니다(WP7).
  if (
    updates.status !== undefined &&
    updates.status !== chapter.status &&
    book.published_at
  ) {
    const blocked = await chapterStatusBlockers(
      supabase,
      chapter.book_id,
      chapterId,
      updates.status as ChapterStatus,
    );
    if (blocked === "error") {
      return apiError("검수하지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
    }
    if (blocked.length > 0) {
      return apiError(
        updates.status === "published"
          ? `공개할 수 없어요: ${blocked.map((check) => check.title).join(", ")}`
          : "독자에게 보이는 마지막 장이에요. 이미 산 독자는 책을 내려도 계속 읽으니, 다른 장을 먼저 공개해 주세요.",
        "PUBLISH_BLOCKED",
        422,
        { blockers: blocked },
      );
    }
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

/**
 * 이 장의 상태를 바꾸면 생기는 차단 항목.
 *
 * 공개할 때는 이 장에 걸린 것만 봅니다 — 이미 공개된 다른 장의 문제로 새
 * 장을 못 올리게 하지 않습니다(그것은 편집 화면 배너가 계속 보여 줍니다).
 * 내릴 때는 독자에게 보이는 장이 하나도 남지 않게 되는지만 봅니다.
 */
async function chapterStatusBlockers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookId: string,
  chapterId: string,
  status: ChapterStatus,
): Promise<PublishCheck[] | "error"> {
  const result = await loadPublishChecks(supabase, bookId, {
    assumeChapterStatus: { id: chapterId, status },
  });
  if (!result.ok) return "error";

  return blockers(result.checks).filter((check) =>
    status === "published"
      ? check.chapterIds?.includes(chapterId)
      : check.id === "no-published-chapters",
  );
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const { chapterId } = await params;
  if (!isUuid(chapterId)) return apiError(CHAPTER_NOT_FOUND, "NOT_FOUND", 404);

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
    return apiError("이 장을 지울 수 없어요.", "FORBIDDEN", 403);
  }

  // 독자 답은 남습니다(chapter_id ON DELETE SET NULL, 00008). 책의 장 수·
  // 글자 수는 DB 트리거가 맞춥니다(00009).
  const { error } = await supabase.from("chapters").delete().eq("id", chapterId);
  if (error) {
    console.error("[chapters] 장을 지우지 못했습니다", { chapterId, error });
    return apiError("장을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }

  // 공개 버킷이라 남겨 두면 유료 책의 이미지가 URL로 계속 열립니다. 다른 장이
  // 아직 쓰는 파일은 남깁니다.
  await removeChapterImages(chapter.book_id, chapterId);

  return apiSuccess({ deleted: true });
}
