import { NextRequest } from "next/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { checkBookAccess } from "@/lib/access-control";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const user = await getAuthUser();
  const result = await checkBookAccess(user?.id ?? null, bookId);

  // 판정하지 못한 것을 "권한 없음"으로 내보내면 이미 산 독자에게 결제
  // 안내가 뜹니다. 화면은 5xx를 "확인하지 못했어요"로 다룹니다.
  if (result.reason === "unavailable") {
    return apiError("접근 권한을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }

  return apiSuccess(result);
}
