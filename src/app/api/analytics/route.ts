import { NextRequest } from "next/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { createClient } from "@/lib/supabase/server";

/**
 * 크리에이터 대시보드 지표.
 *
 * 독자 수는 구매 기록에서만 셉니다. 열람 진행률·하이라이트 테이블은
 * MVP 범위 밖이라 없습니다. 워크북 응답 기반 참여 지표는 M5에서
 * `workbook_response_stats()`로 붙입니다.
 */

type Period = "7d" | "30d" | "all";

function getPeriodStart(period: Period): string | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : 30;
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  const { searchParams } = new URL(req.url);
  const periodParam = searchParams.get("period") ?? "30d";
  const period: Period = (["7d", "30d", "all"].includes(periodParam)
    ? periodParam
    : "30d") as Period;

  const supabase = await createClient();
  const periodStart = getPeriodStart(period);

  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, title, total_chapters, total_words, status, visibility, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (booksError) {
    return apiError("Failed to fetch books", "SERVER_ERROR", 500);
  }

  const bookList = books ?? [];
  const bookIds = bookList.map((book) => book.id);

  const totalChapters = bookList.reduce(
    (sum, book) => sum + (book.total_chapters ?? 0),
    0,
  );
  const totalWords = bookList.reduce(
    (sum, book) => sum + (book.total_words ?? 0),
    0,
  );

  let purchases: Array<{
    user_id: string;
    book_id: string;
    purchased_at: string;
  }> = [];

  if (bookIds.length > 0) {
    let purchasesQuery = supabase
      .from("purchases")
      .select("user_id, book_id, purchased_at")
      .in("book_id", bookIds)
      .eq("status", "completed");

    if (periodStart) {
      purchasesQuery = purchasesQuery.gte("purchased_at", periodStart);
    }

    const { data } = await purchasesQuery;
    purchases = data ?? [];
  }

  const uniqueReaders = new Set(purchases.map((p) => p.user_id)).size;

  const bookStats = bookList.map((book) => ({
    id: book.id,
    title: book.title,
    status: book.status,
    total_chapters: book.total_chapters,
    total_words: book.total_words,
    readers: new Set(
      purchases.filter((p) => p.book_id === book.id).map((p) => p.user_id),
    ).size,
  }));

  // 날짜별 신규 독자 수
  const readersByDay = new Map<string, Set<string>>();
  for (const purchase of purchases) {
    const day = purchase.purchased_at?.slice(0, 10);
    if (!day) continue;
    const bucket = readersByDay.get(day) ?? new Set<string>();
    bucket.add(purchase.user_id);
    readersByDay.set(day, bucket);
  }

  const timeline = [...readersByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, readers]) => ({ date, readers: readers.size }));

  return apiSuccess({
    overview: {
      total_books: bookList.length,
      total_chapters: totalChapters,
      total_words: totalWords,
      total_readers: uniqueReaders,
    },
    books: bookStats,
    timeline,
    period,
  });
}
