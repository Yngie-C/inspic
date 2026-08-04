import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, apiSuccess } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const language = searchParams.get("language") ?? "";
  const sort = searchParams.get("sort") ?? "newest";
  const priceRange = searchParams.get("priceRange") ?? "";
  const authorId = searchParams.get("author_id") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(
    48,
    Math.max(1, parseInt(searchParams.get("per_page") ?? "24", 10)),
  );
  const offset = (page - 1) * perPage;

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
    dbQuery = dbQuery.or(
      `title.ilike.%${query.trim()}%,description.ilike.%${query.trim()}%`,
    );
  }

  if (language) {
    dbQuery = dbQuery.eq("language", language);
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
    // newest
    dbQuery = dbQuery.order("published_at", { ascending: false });
  }

  dbQuery = dbQuery.range(offset, offset + perPage - 1);

  const { data, error, count } = await dbQuery;

  if (error) return apiError(error.message, "SERVER_ERROR", 500);

  // Fetch author names separately (no direct FK between books and user_profiles)
  const ownerIds = [...new Set((data ?? []).map((b) => b.owner_id as string))];
  const authorMap = new Map<string, string | null>();

  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, display_name")
      .in("user_id", ownerIds);

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
