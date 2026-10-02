import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();

  // Fetch book
  const { data: bookData, error: bookError } = await supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .single();

  if (bookError || !bookData) {
    return apiError("Book not found", "NOT_FOUND", 404);
  }

  // 누가 이 책을 보는지는 RLS가 정합니다(books_select_*). 여기서
  // 공개 상태를 다시 보면 저자가 내린 책을 산 독자가 상세 화면을 잃습니다.
  const isOwner = user?.id === bookData.owner_id;

  // Fetch author name separately (no FK between books.owner_id and user_profiles.user_id)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("user_id", bookData.owner_id)
    .maybeSingle();

  const book = { ...bookData, author_name: profile?.display_name ?? null };

  // Fetch chapters (non-owners only see published chapters)
  let chaptersQuery = supabase
    .from("chapters")
    .select("id, title, slug, order_index, word_count, estimated_reading_time, created_at, updated_at, book_id, status, published_at")
    .eq("book_id", bookId)
    .order("order_index", { ascending: true });

  if (!isOwner) {
    chaptersQuery = chaptersQuery.eq("status", "published");
  }

  const { data: chapters } = await chaptersQuery;

  return apiSuccess({
    book,
    chapters: chapters ?? [],
  });
}
