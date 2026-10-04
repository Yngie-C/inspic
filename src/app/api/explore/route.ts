import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, apiSuccess } from "@/lib/api-utils";
import { ilikeAnyFilter } from "@/lib/postgrest-filter";
import { isUuid } from "@/lib/template-node-id";

/**
 * 숫자로 읽을 수 없는 값(`?page=abc`, `?per_page=`)은 기본값입니다. 그대로
 * 두면 NaN이 `.range(NaN, NaN)`이 되어 500이었습니다(코드 리뷰 7-P2-5).
 */
function readPositiveInt(raw: string | null, fallback: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value >= 1 ? value : fallback;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") ?? "newest";
  const priceRange = searchParams.get("priceRange") ?? "";
  const authorId = searchParams.get("author_id") ?? "";
  const page = readPositiveInt(searchParams.get("page"), 1);
  const perPage = Math.min(48, readPositiveInt(searchParams.get("per_page"), 24));
  const offset = (page - 1) * perPage;

  // UUID가 아니면 Postgres가 22P02로 거절해 원문 500이 나갔습니다(7-P2-6).
  if (authorId && !isUuid(authorId)) {
    return apiError("작가 주소가 올바르지 않아요.", "VALIDATION_ERROR", 400);
  }

  const supabase = await createClient();

  let dbQuery = supabase
    .from("books")
    .select(
      `id, title, description, cover_image_url, language,
      status, visibility, total_chapters, total_words,
      published_at, created_at, updated_at, owner_id,
      source_type, source_file_url, price`,
      { count: "exact" },
    )
    .eq("status", "published")
    .eq("visibility", "public");

  if (authorId) {
    dbQuery = dbQuery.eq("owner_id", authorId);
  }

  if (query.trim()) {
    dbQuery = dbQuery.or(ilikeAnyFilter(["title", "description"], query.trim()));
  }

  if (priceRange === "free") {
    dbQuery = dbQuery.eq("price", 0);
  } else if (priceRange === "0-5000") {
    dbQuery = dbQuery.gt("price", 0).lte("price", 5000);
  } else if (priceRange === "5000-10000") {
    dbQuery = dbQuery.gt("price", 5000).lte("price", 10000);
  } else if (priceRange === "10000+") {
    dbQuery = dbQuery.gt("price", 10000);
  }

  // Sorting
  if (sort === "title") {
    dbQuery = dbQuery.order("title", { ascending: true });
  } else if (sort === "popular") {
    dbQuery = dbQuery.order("total_words", { ascending: false });
  } else if (sort === "price_asc") {
    dbQuery = dbQuery.order("price", { ascending: true });
  } else if (sort === "price_desc") {
    dbQuery = dbQuery.order("price", { ascending: false });
  } else {
    // newest. 내림차순의 기본은 NULL이 맨 앞이라 출간일 없는 책이 "최신"
    // 맨 위에 섰습니다.
    dbQuery = dbQuery.order("published_at", { ascending: false, nullsFirst: false });
  }

  // 동률(무료 책끼리의 가격 0 등)의 순서는 Postgres가 요청마다 보장하지
  // 않습니다. 유일한 키로 마지막 순서를 정해야 페이지 사이에서 책이 겹치거나
  // 빠지지 않습니다(7-P2-7).
  dbQuery = dbQuery.order("id", { ascending: true });

  dbQuery = dbQuery.range(offset, offset + perPage - 1);

  const { data, error, count } = await dbQuery;

  if (error) {
    console.error("[explore] 책을 읽지 못했습니다", error.message);
    return apiError("책 목록을 불러오지 못했어요.", "SERVER_ERROR", 500);
  }

  // Fetch author names separately (no direct FK between books and user_profiles)
  const ownerIds = [...new Set((data ?? []).map((b) => b.owner_id as string))];
  const authorMap = new Map<string, string | null>();

  if (ownerIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("user_profiles")
      .select("user_id, display_name")
      .in("user_id", ownerIds);

    // 저자 이름은 없어도 목록은 그려집니다. 막지 않고 남기기만 합니다.
    if (profilesError) {
      console.error("[explore] 저자 이름을 읽지 못했습니다", profilesError.message);
    }

    for (const p of profiles ?? []) {
      authorMap.set(p.user_id as string, p.display_name as string | null);
    }
  }

  const books = (data ?? []).map((b) => ({
    ...b,
    author_name: authorMap.get(b.owner_id as string) ?? null,
  }));

  return apiSuccess({
    books,
    total: count ?? 0,
    page,
    per_page: perPage,
  });
}
