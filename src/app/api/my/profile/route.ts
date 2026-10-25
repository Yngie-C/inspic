import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess, readJsonObject } from "@/lib/api-utils";
import { INVALID_BODY_MESSAGE, MAX_BIO_LENGTH, parseProfileUpdate } from "@/lib/authoring-input";

const SAVE_FAILED = "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.";

/** Postgres check_violation. */
const CHECK_VIOLATION = "23514";

/**
 * `bio` 80자 CHECK는 `NOT VALID`라(00015) 예전에 쓴 긴 소개가 남아 있고,
 * 그 행은 이름만 바꿔도 거절됩니다. 일반 실패로 내면 고칠 방법을 모릅니다.
 */
function isBioTooLong(error: { code?: string; message?: string }): boolean {
  return error.code === CHECK_VIOLATION && !!error.message?.includes("user_profiles_bio_length");
}

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

  if (error && isBioTooLong(error)) {
    return apiError(
      `한 줄 소개가 ${MAX_BIO_LENGTH}자를 넘어요. 줄여서 함께 저장해 주세요.`,
      "VALIDATION_ERROR",
      400,
    );
  }
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
