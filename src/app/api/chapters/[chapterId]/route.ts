import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { sanitizeContent } from "@/lib/sanitize";
import {
  CHAPTER_TOO_LONG_MESSAGE,
  countWords,
  isChapterHtmlTooLong,
} from "@/lib/content-stats";
import { syncChapterWorkbookBlocks } from "@/lib/workbook/sync-blocks";

type Params = { params: Promise<{ chapterId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { chapterId } = await params;
  const supabase = await createClient();

  const { data: chapter, error } = await supabase
    .from("chapters")
    .select("*")
    .eq("id", chapterId)
    .single();

  if (error || !chapter) return apiError("Chapter not found", "NOT_FOUND", 404);

  // Verify access via book
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("owner_id, visibility")
    .eq("id", chapter.book_id)
    .single();

  if (bookError || !book) return apiError("Book not found", "NOT_FOUND", 404);
  if (book.owner_id !== user.id && book.visibility === "private") {
    return apiError("Access denied", "FORBIDDEN", 403);
  }

  // Non-owners cannot access draft chapters
  if (book.owner_id !== user.id && chapter.status === "draft") {
    return apiError("Chapter not found", "NOT_FOUND", 404);
  }

  return apiSuccess(chapter);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { chapterId } = await params;
  const supabase = await createClient();

  const { data: chapter, error: fetchError } = await supabase
    .from("chapters")
    .select("*, books(owner_id, total_words)")
    .eq("id", chapterId)
    .single();

  if (fetchError || !chapter) return apiError("Chapter not found", "NOT_FOUND", 404);

  const book = chapter.books as { owner_id: string; total_words: number } | null;
  if (!book) return apiError("Book not found", "NOT_FOUND", 404);
  if (book.owner_id !== user.id) return apiError("Access denied", "FORBIDDEN", 403);

  let body: {
    title?: string;
    content_html?: string;
    content_raw?: string;
    order_index?: number;
    status?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = String(body.title).trim();
  if (body.order_index !== undefined) updates.order_index = body.order_index;
  if (body.content_raw !== undefined) updates.content_raw = body.content_raw;
  if (body.status !== undefined && ["draft", "published"].includes(body.status)) {
    updates.status = body.status;
    if (body.status === "published" && !chapter.published_at) {
      updates.published_at = new Date().toISOString();
    }
  }

  let wordDiff = 0;
  let sanitizedHtml: string | null = null;
  if (body.content_html !== undefined) {
    sanitizedHtml = sanitizeContent(body.content_html);
    if (isChapterHtmlTooLong(sanitizedHtml)) {
      return apiError(CHAPTER_TOO_LONG_MESSAGE, "CONTENT_TOO_LONG", 400);
    }
    const newWordCount = countWords(sanitizedHtml);
    wordDiff = newWordCount - (chapter.word_count ?? 0);
    updates.content_html = sanitizedHtml;
    updates.word_count = newWordCount;
  }

  if (Object.keys(updates).length === 0) {
    return apiError("No valid fields to update", "VALIDATION_ERROR", 400);
  }

  const { data, error } = await supabase
    .from("chapters")
    .update(updates)
    .eq("id", chapterId)
    .select()
    .single();

  if (error) return apiError(error.message, "SERVER_ERROR", 500);

  // 본문이 바뀌었으면 블록 정의를 다시 맞춥니다. 저장된 HTML에서 뽑아야
  // 정의와 본문이 어긋나지 않으므로 sanitize된 쪽을 넘깁니다.
  const workbookSync =
    sanitizedHtml === null
      ? null
      : await syncChapterWorkbookBlocks(supabase, chapterId, sanitizedHtml);

  // Recalculate book total_words if content changed
  if (wordDiff !== 0) {
    await supabase
      .from("books")
      .update({ total_words: Math.max(0, (book.total_words ?? 0) + wordDiff) })
      .eq("id", chapter.book_id);
  }

  return apiSuccess({ ...data, workbook_sync: workbookSync });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { chapterId } = await params;
  const supabase = await createClient();

  const { data: chapter, error: fetchError } = await supabase
    .from("chapters")
    .select("*, books(owner_id, total_chapters)")
    .eq("id", chapterId)
    .single();

  if (fetchError || !chapter) return apiError("Chapter not found", "NOT_FOUND", 404);

  const book = chapter.books as { owner_id: string; total_chapters: number } | null;
  if (!book) return apiError("Book not found", "NOT_FOUND", 404);
  if (book.owner_id !== user.id) return apiError("Access denied", "FORBIDDEN", 403);

  const { error } = await supabase.from("chapters").delete().eq("id", chapterId);
  if (error) return apiError(error.message, "SERVER_ERROR", 500);

  await supabase
    .from("books")
    .update({ total_chapters: Math.max(0, (book.total_chapters ?? 1) - 1) })
    .eq("id", chapter.book_id);

  return apiSuccess({ deleted: true });
}
