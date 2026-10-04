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

  // `.single()`은 행이 없을 때 PGRST116을 돌려줍니다. 그것만 404이고, 나머지는
  // 장애입니다 — 404로 내면 결제 화면에서 산 책이 "삭제됐거나 권한 없음"으로
  // 보입니다(코드 리뷰 7-P2-3).
  if (bookError?.code === "PGRST116" || (!bookError && !bookData)) {
    return apiError("Book not found", "NOT_FOUND", 404);
  }
  if (bookError) {
    console.error("[books/detail] 책을 읽지 못했습니다", bookError.message);
    return apiError("책을 불러오지 못했어요.", "SERVER_ERROR", 500);
  }

  // 누가 이 책을 보는지는 RLS가 정합니다(books_select_*). 여기서
  // 공개 상태를 다시 보면 저자가 내린 책을 산 독자가 상세 화면을 잃습니다.
  const isOwner = user?.id === bookData.owner_id;

  // Fetch author name separately (no FK between books.owner_id and user_profiles.user_id)
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("user_id", bookData.owner_id)
    .maybeSingle();

  // 저자 이름은 없어도 상세 화면은 그려집니다. 막지 않고 남기기만 합니다.
  if (profileError) {
    console.error("[books/detail] 저자 이름을 읽지 못했습니다", profileError.message);
  }

  const book = { ...bookData, author_name: profile?.display_name ?? null };

  // 소유자는 편집용으로 draft까지 봅니다. 나머지는 목차 함수로 published 장의
  // 제목을 봅니다 — chapters를 직접 읽으면 RLS가 사지 않은 독자에게 미리보기
  // 장 하나만 보여 줘서, 유료 책 목차가 1장으로 나왔습니다(코드 리뷰 7-P1-8,
  // 마이그레이션 00011). 본문은 어느 쪽도 읽지 않습니다.
  const chaptersQuery = isOwner
    ? supabase
        .from("chapters")
        .select("id, title, slug, order_index, word_count, estimated_reading_time, created_at, updated_at, book_id, status, published_at")
        .eq("book_id", bookId)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
    : supabase.rpc("book_table_of_contents", { p_book_id: bookId });

  const { data: chapters, error: chaptersError } = await chaptersQuery;

  // 빈 목록으로 넘기면 구매자에게도 "아직 공개된 장이 없어요"가 뜹니다(7-P1-9).
  if (chaptersError) {
    console.error("[books/detail] 장을 읽지 못했습니다", chaptersError.message);
    return apiError("목차를 불러오지 못했어요.", "SERVER_ERROR", 500);
  }

  return apiSuccess({
    book,
    chapters: chapters ?? [],
  });
}
