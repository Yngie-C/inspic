import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { loadPublishChecks } from "@/lib/publish-checks-loader";
import { blockers, canPublish, warnings } from "@/lib/publish-checks";

/**
 * 공개 전 검수 결과. 미리보기 화면이 출간 직전에 읽습니다.
 *
 * 출간 API(`PUT /api/books/[bookId]`)가 쓰는 판정과 같은 함수입니다.
 * 공개 중인 책의 편집 화면도 이것을 읽어 차단 사유를 배너로 띄웁니다.
 */

type Params = { params: Promise<{ bookId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { bookId } = await params;
  const supabase = await createClient();

  const { data: book, error } = await supabase
    .from("books")
    .select("owner_id")
    .eq("id", bookId)
    .maybeSingle();

  if (error) {
    console.error("[publish-checks] 책을 읽지 못했습니다", { bookId, error });
    return apiError("검수하지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }
  if (!book) return apiError("Book not found", "NOT_FOUND", 404);
  if (book.owner_id !== user.id) return apiError("Access denied", "FORBIDDEN", 403);

  const result = await loadPublishChecks(supabase, bookId);
  if (!result.ok) {
    // 조회 실패를 404나 빈 검수로 내면 DB 장애가 "책 없음"이나 거짓
    // 차단으로 보입니다(4-P1-25).
    return result.reason === "not-found"
      ? apiError("Book not found", "NOT_FOUND", 404)
      : apiError("검수하지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }

  return apiSuccess({
    can_publish: canPublish(result.checks),
    blockers: blockers(result.checks),
    warnings: warnings(result.checks),
  });
}
