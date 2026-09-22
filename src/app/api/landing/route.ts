import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, apiSuccess } from "@/lib/api-utils";

export const revalidate = 300;

interface BookWithAuthor {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  language: string | null;
  status: string;
  visibility: string;
  total_chapters: number | null;
  total_words: number | null;
  published_at: string | null;
  price: number;
  owner_id: string;
  author_name: string | null;
}

const BOOK_SELECT =
  "id, title, description, cover_image_url, language, status, visibility, total_chapters, total_words, published_at, price, owner_id";

async function fetchAuthorMap(
  admin: ReturnType<typeof createAdminClient>,
  books: Record<string, unknown>[],
): Promise<Map<string, string | null>> {
  const ownerIds = [...new Set(books.map((b) => b.owner_id as string))];
  const map = new Map<string, string | null>();
  if (ownerIds.length === 0) return map;

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("user_id, display_name")
    .in("user_id", ownerIds);

  for (const p of (profiles ?? [])) {
    map.set(p.user_id as string, p.display_name as string | null);
  }
  return map;
}

function toBookWithAuthor(
  b: Record<string, unknown>,
  authorMap: Map<string, string | null>,
): BookWithAuthor {
  return {
    ...(b as Omit<BookWithAuthor, "author_name">),
    author_name: authorMap.get(b.owner_id as string) ?? null,
    language: (b.language as string | null) ?? "ko",
    total_chapters: (b.total_chapters as number | null) ?? 0,
    total_words: (b.total_words as number | null) ?? 0,
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const admin = createAdminClient();

    const [
      purchasesResult,
      newestResult,
      freeResult,
      totalBooksResult,
      authorsResult,
    ] = await Promise.all([
      // 1. Purchase counts for featured
      admin.from("purchases").select("book_id").eq("status", "completed"),
      // 2. Newest books
      admin
        .from("books")
        .select(BOOK_SELECT)
        .eq("status", "published")
        .eq("visibility", "public")
        .order("published_at", { ascending: false })
        .limit(8),
      // 3. Free books
      admin
        .from("books")
        .select(BOOK_SELECT)
        .eq("status", "published")
        .eq("visibility", "public")
        .eq("price", 0)
        .order("published_at", { ascending: false })
        .limit(8),
      // 4a. Total published books count
      admin
        .from("books")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("visibility", "public"),
      // 4b. All owner_ids for unique author count
      admin
        .from("books")
        .select("owner_id")
        .eq("status", "published")
        .eq("visibility", "public"),
    ]);

    // supabase-js는 연결·쿼리 실패를 던지지 않고 error로 돌려줍니다.
    // 그대로 넘기면 DB에 닿지 못해도 "책 0권"인 정상 응답이 나가서 장애가 가려집니다.
    const failed = [
      purchasesResult,
      newestResult,
      freeResult,
      totalBooksResult,
      authorsResult,
    ].find((r) => r.error);
    if (failed?.error) throw failed.error;

    // --- Collect all books for batch author lookup ---
    const allRawBooks: Record<string, unknown>[] = [
      ...((newestResult.data ?? []) as Record<string, unknown>[]),
      ...((freeResult.data ?? []) as Record<string, unknown>[]),
    ];

    // --- Featured: derive from purchase counts ---
    let featuredRaw: Record<string, unknown>[] = [];
    {
      const purchases = purchasesResult.data ?? [];

      if (purchases.length > 0) {
        const countMap: Record<string, number> = {};
        for (const p of purchases) {
          const bid = p.book_id as string;
          countMap[bid] = (countMap[bid] ?? 0) + 1;
        }
        const topBookIds = Object.entries(countMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([id]) => id);

        const { data: featuredData } = await admin
          .from("books")
          .select(BOOK_SELECT)
          .in("id", topBookIds)
          .eq("status", "published")
          .eq("visibility", "public");

        featuredRaw = (featuredData ?? []) as Record<string, unknown>[];
      } else {
        const { data: fallbackData } = await admin
          .from("books")
          .select(BOOK_SELECT)
          .eq("status", "published")
          .eq("visibility", "public")
          .order("total_words", { ascending: false })
          .limit(8);

        featuredRaw = (fallbackData ?? []) as Record<string, unknown>[];
      }
    }
    allRawBooks.push(...featuredRaw);

    // --- Batch fetch author names ---
    const authorMap = await fetchAuthorMap(admin, allRawBooks);

    // --- Map to BookWithAuthor ---
    const featured = featuredRaw.map((b) => toBookWithAuthor(b, authorMap));
    const newest = ((newestResult.data ?? []) as Record<string, unknown>[]).map(
      (b) => toBookWithAuthor(b, authorMap),
    );
    const free = ((freeResult.data ?? []) as Record<string, unknown>[]).map(
      (b) => toBookWithAuthor(b, authorMap),
    );

    // --- Stats ---
    const totalBooks = totalBooksResult.count ?? 0;
    const ownerIds = (authorsResult.data ?? []).map(
      (r) => (r as Record<string, unknown>).owner_id as string,
    );
    const totalAuthors = new Set(ownerIds).size;

    return apiSuccess({
      featured,
      newest,
      free,
      stats: { totalBooks, totalAuthors },
    });
  } catch (err) {
    console.error("[landing/route] error:", err);
    return apiError("랜딩 데이터를 불러오는 중 오류가 발생했습니다.", "SERVER_ERROR", 500);
  }
}
