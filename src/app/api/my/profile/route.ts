import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess, readJsonObject } from "@/lib/api-utils";
import { INVALID_BODY_MESSAGE, parseProfileUpdate } from "@/lib/authoring-input";

const SAVE_FAILED = "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.";

/**
 * 내 프로필(이름·한 줄 소개·이력) 저장. 사진은 `/api/my/avatar`로만 바꿉니다.
 *
 * 행은 auth.users 트리거가 만들어 두므로 UPDATE만 합니다(00001).
 */
export async function PUT(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const body = await readJsonObject(request);
  if (!body) return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);

  const parsed = parseProfileUpdate(body);
  if (!parsed.ok) return apiError(parsed.message, "VALIDATION_ERROR", 400);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[my/profile] 프로필을 저장하지 못했습니다", { userId: user.id, error });
    return apiError(SAVE_FAILED, "SERVER_ERROR", 500);
  }
  if (!data) {
    // 트리거가 행을 만들지 못한 계정입니다. 조용히 성공으로 내면 저장된 줄 압니다.
    console.error("[my/profile] 프로필 행이 없습니다", { userId: user.id });
    return apiError(SAVE_FAILED, "SERVER_ERROR", 500);
  }

  return apiSuccess({ profile: data });
}
