import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, apiSuccess } from "@/lib/api-utils";
import { readAllRows } from "@/lib/supabase/read-all";
import { isUuid } from "@/lib/template-node-id";

const NOT_FOUND = "저자를 찾을 수 없어요.";

/**
 * 저자 페이지 데이터: 공개 프로필과 그 저자가 공개한 책 전부.
 *
 * 책은 `status`/`visibility`를 직접 거릅니다 — 구매자는 RLS로 산 비공개 책도
 * 보이므로(00006) RLS에 맡기면 저자가 내린 책이 저자 페이지에 섞입니다.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  if (!isUuid(userId)) return apiError(NOT_FOUND, "NOT_FOUND", 404);

  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id, display_name, bio, about, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("[authors] 프로필을 읽지 못했습니다", { userId, error: profileError.message });
    return apiError("저자 정보를 불러오지 못했어요.", "SERVER_ERROR", 500);
  }
  if (!profile) return apiError(NOT_FOUND, "NOT_FOUND", 404);

  const books = await readAllRows((from, to) =>
    supabase
      .from("books")
      .select("id, owner_id, title, description, cover_image_url, price, total_chapters, published_at")
      .eq("owner_id", userId)
      .eq("status", "published")
      .eq("visibility", "public")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to),
  );

  if (books.error) {
    console.error("[authors] 책을 읽지 못했습니다", { userId, error: books.error.message });
    return apiError("저자 정보를 불러오지 못했어요.", "SERVER_ERROR", 500);
  }

  return apiSuccess({ profile, books: books.data });
}
