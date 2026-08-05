import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { loadPublishChecks } from "@/lib/publish-checks-loader";
import { blockers, canPublish, warnings } from "@/lib/publish-checks";

/**
 * 공개 전 검수 결과. 미리보기 화면이 출간 직전에 읽습니다.
 *
 * 출간 API(`PUT /api/books/[bookId]`)가 쓰는 판정과 같은 함수입니다.
 */

type Params = { params: Promise<{ bookId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { bookId } = await params;
  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("owner_id")
    .eq("id", bookId)
    .single();

  if (!book) return apiError("Book not found", "NOT_FOUND", 404);
  if (book.owner_id !== user.id) return apiError("Access denied", "FORBIDDEN", 403);

  const result = await loadPublishChecks(supabase, bookId);
  if (!result.ok) return apiError("Book not found", "NOT_FOUND", 404);

  return apiSuccess({
    can_publish: canPublish(result.checks),
    blockers: blockers(result.checks),
    warnings: warnings(result.checks),
  });
}
