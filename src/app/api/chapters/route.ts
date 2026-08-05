import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { sanitizeContent } from "@/lib/sanitize";
import { countWords } from "@/lib/content-stats";
import { syncChapterWorkbookBlocks } from "@/lib/workbook/sync-blocks";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get("bookId");

  if (!bookId) return apiError("bookId query parameter is required", "VALIDATION_ERROR", 400);

  const supabase = await createClient();

  // Verify book access
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("owner_id, visibility")
    .eq("id", bookId)
    .single();

  if (bookError || !book) return apiError("Book not found", "NOT_FOUND", 404);
  if (book.owner_id !== user.id && book.visibility === "private") {
    return apiError("Access denied", "FORBIDDEN", 403);
  }

  const isOwner = book.owner_id === user.id;
  let chaptersQuery = supabase
    .from("chapters")
    .select("*")
    .eq("book_id", bookId)
    .order("order_index", { ascending: true });

  if (!isOwner) {
    chaptersQuery = chaptersQuery.eq("status", "published");
  }

  const { data, error } = await chaptersQuery;

  if (error) return apiError(error.message, "SERVER_ERROR", 500);

  return apiSuccess(data ?? []);
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  let body: {
    book_id?: string;
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

  const { book_id, title, content_html, content_raw, order_index, status } = body;

  if (!book_id || typeof book_id !== "string") {
    return apiError("book_id is required", "VALIDATION_ERROR", 400);
  }
  if (!title || typeof title !== "string" || title.trim() === "") {
    return apiError("title is required", "VALIDATION_ERROR", 400);
  }
  if (content_html === undefined || typeof content_html !== "string") {
    return apiError("content_html is required", "VALIDATION_ERROR", 400);
  }
  if (order_index === undefined || typeof order_index !== "number") {
    return apiError("order_index is required", "VALIDATION_ERROR", 400);
  }

  const supabase = await createClient();

  // Verify book ownership
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("owner_id, total_chapters, total_words")
    .eq("id", book_id)
    .single();

  if (bookError || !book) return apiError("Book not found", "NOT_FOUND", 404);
  if (book.owner_id !== user.id) return apiError("Access denied", "FORBIDDEN", 403);

  const sanitized = sanitizeContent(content_html);
  const word_count = countWords(sanitized);
  const slug = `chapter-${order_index + 1}-${Date.now()}`;

  const resolvedStatus =
    status && ["draft", "published"].includes(status) ? status : "published";

  const { data: chapter, error: insertError } = await supabase
    .from("chapters")
    .insert({
      book_id,
      title: title.trim(),
      slug,
      order_index,
      content_html: sanitized,
      content_raw: content_raw ?? null,
      word_count,
      status: resolvedStatus,
    })
    .select()
    .single();

  if (insertError) return apiError(insertError.message, "SERVER_ERROR", 500);

  const workbookSync = await syncChapterWorkbookBlocks(
    supabase,
    chapter.id,
    sanitized,
  );

  // Update book totals
  await supabase
    .from("books")
    .update({
      total_chapters: (book.total_chapters ?? 0) + 1,
      total_words: (book.total_words ?? 0) + word_count,
    })
    .eq("id", book_id);

  return apiSuccess({ ...chapter, workbook_sync: workbookSync }, 201);
}
