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

  const { data: profiles, error } = await admin
    .from("user_profiles")
    .select("user_id, display_name")
    .in("user_id", ownerIds);

  // 저자 이름은 없어도 책 목록은 그려집니다. 막지 않고 남기기만 합니다.
  if (error) {
    console.error("[landing/route] 저자 이름을 읽지 못했습니다", error.message);
  }

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

    const [newestResult, totalBooksResult] = await Promise.all([
      admin
        .from("books")
        .select(BOOK_SELECT)
        .eq("status", "published")
        .eq("visibility", "public")
        .order("published_at", { ascending: false })
        .limit(8),
      admin
        .from("books")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("visibility", "public"),
    ]);

    // supabase-js는 연결·쿼리 실패를 던지지 않고 error로 돌려줍니다.
    // 그대로 넘기면 DB에 닿지 못해도 "책 0권"인 정상 응답이 나가서 장애가 가려집니다.
    const failed = [newestResult, totalBooksResult].find((r) => r.error);
    if (failed?.error) throw failed.error;

    const newestRaw = (newestResult.data ?? []) as Record<string, unknown>[];
    const authorMap = await fetchAuthorMap(admin, newestRaw);
    const newest = newestRaw.map((b) => toBookWithAuthor(b, authorMap));

    return apiSuccess({
      newest,
      stats: { totalBooks: totalBooksResult.count ?? 0 },
    });
  } catch (err) {
    console.error("[landing/route] error:", err);
    return apiError("책 목록을 불러오지 못했어요.", "SERVER_ERROR", 500);
  }
}
