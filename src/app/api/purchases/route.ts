import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchases")
    .select(`
      id, user_id, book_id, price_paid, payment_method, status, purchased_at, created_at,
      books (
        id, title, description, cover_image_url, language, status, visibility,
        total_chapters, total_words, owner_id
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("purchased_at", { ascending: false });

  if (error) {
    // If the table doesn't exist or query fails, return empty array gracefully
    console.error("[purchases] Supabase query error:", error.message);
    return apiSuccess([]);
  }

  // Fetch author names separately (no direct FK between books and user_profiles)
  const ownerIds = [...new Set(
    (data ?? [])
      .map((p) => (p.books as unknown as Record<string, unknown> | null)?.owner_id as string)
      .filter(Boolean),
  )];

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
