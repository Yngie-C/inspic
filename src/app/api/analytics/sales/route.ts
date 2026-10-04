import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { readAllRows } from "@/lib/supabase/read-all";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const supabase = await createClient();

  // 조회 실패를 빈 결과로 넘기면 판매가 있는 저자에게 "0원 / 0건"이
  // 실제 매출처럼 보입니다(코드 리뷰 7-P1-1). 500이어야 화면이 오류를 띄웁니다.
  const { data: myBooks, error: booksError } = await supabase
    .from("books")
    .select("id, title, price")
    .eq("owner_id", user.id);

  if (booksError) {
    console.error("[analytics/sales] 책을 읽지 못했습니다", booksError.message);
    return apiError("판매 현황을 불러오지 못했어요.", "SERVER_ERROR", 500);
  }

  if (!myBooks || myBooks.length === 0) {
    return apiSuccess({
      totalRevenue: 0,
      totalSales: 0,
      bookStats: [],
    });
  }

  const bookIds = myBooks.map((b) => b.id);

  // 내 책들의 구매 기록. 1000건에서 잘리면 매출이 덜 셉니다(7-P1-2).
  const { data: purchaseList, error: purchasesError } = await readAllRows<{
    book_id: string;
    price_paid: number;
  }>((from, to) =>
    supabase
      .from("purchases")
      .select("book_id, price_paid")
      .in("book_id", bookIds)
      .eq("status", "completed")
      .order("id")
      .range(from, to),
  );

  if (purchasesError) {
    console.error("[analytics/sales] 구매를 읽지 못했습니다", purchasesError.message);
    return apiError("판매 현황을 불러오지 못했어요.", "SERVER_ERROR", 500);
  }

  // 책별 통계 계산
  const bookStatsMap = new Map<string, { sales: number; revenue: number }>();
  for (const p of purchaseList) {
    const existing = bookStatsMap.get(p.book_id) ?? { sales: 0, revenue: 0 };
    existing.sales += 1;
    existing.revenue += p.price_paid;
    bookStatsMap.set(p.book_id, existing);
  }

  const bookStats = myBooks.map((book) => {
    const stats = bookStatsMap.get(book.id) ?? { sales: 0, revenue: 0 };
    return {
      bookId: book.id,
      title: book.title,
      price: book.price,
      sales: stats.sales,
      revenue: stats.revenue,
    };
  });

  const totalRevenue = purchaseList.reduce((sum, p) => sum + p.price_paid, 0);
  const totalSales = purchaseList.length;

  return apiSuccess({
    totalRevenue,
    totalSales,
    bookStats,
  });
}
