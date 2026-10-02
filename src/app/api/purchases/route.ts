import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";

/**
 * 내 구매.
 *
 * 서재와 구매 내역은 다른 질문입니다.
 *   기본           지금 읽을 수 있는 책 — completed 구매만 (내 서재)
 *   ?scope=history 결제한 기록 전부 — 환불·실패도 (구매 내역)
 * 같은 응답을 나눠 쓰던 때는 내역에 환불 배지가 영영 뜨지 않았습니다.
 *
 * 저자가 책을 비공개·보관으로 돌려도 산 책은 서재에 남습니다. 책 행은
 * books_select_purchased(마이그레이션 00006)가 completed 구매자에게
 * 보여 줍니다. 환불된 구매의 책은 공개 중이 아니면 `books: null`입니다.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const scope = new URL(request.url).searchParams.get("scope");
  const supabase = await createClient();

  let query = supabase
    .from("purchases")
    .select(`
      id, user_id, book_id, price_paid, payment_method, status, purchased_at, created_at,
      books (
        id, title, description, cover_image_url, language, status, visibility,
        total_chapters, total_words, owner_id
      )
    `)
    .eq("user_id", user.id)
    .order("purchased_at", { ascending: false });

  if (scope !== "history") query = query.eq("status", "completed");

  const { data, error } = await query;

  // 빈 목록으로 넘기면 결제한 독자에게 "아직 구매한 책이 없어요"가 뜹니다.
  // 500이면 화면의 "다시 시도"가 동작합니다.
  if (error) {
    console.error("[purchases] 구매 목록을 읽지 못했습니다", error.message);
    return apiError("구매한 책을 불러오지 못했어요.", "SERVER_ERROR", 500);
  }

  // Fetch author names separately (no direct FK between books and user_profiles)
  const ownerIds = [...new Set(
    (data ?? [])
      .map((p) => (p.books as unknown as Record<string, unknown> | null)?.owner_id as string)
      .filter(Boolean),
  )];

  const authorMap = new Map<string, string | null>();
  if (ownerIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("user_profiles")
      .select("user_id, display_name")
      .in("user_id", ownerIds);

    // 저자 이름은 없어도 서재는 그려집니다. 막지 않고 남기기만 합니다.
    if (profilesError) {
      console.error("[purchases] 저자 이름을 읽지 못했습니다", profilesError.message);
    }

    for (const p of profiles ?? []) {
      authorMap.set(p.user_id as string, p.display_name as string | null);
    }
  }

  const purchases = (data ?? []).map((p) => {
    const book = p.books as unknown as Record<string, unknown> | null;
    if (book) {
      return {
        ...p,
        books: { ...book, author_name: authorMap.get(book.owner_id as string) ?? null },
      };
    }
    return p;
  });

  return apiSuccess(purchases);
}
