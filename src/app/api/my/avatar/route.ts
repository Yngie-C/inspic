import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { readImageUpload, type ImageMime } from "@/lib/image-upload";
import { AVATARS_BUCKET, removeAvatarFile } from "@/lib/storage-cleanup";

/**
 * 내 프로필 사진 올리기/지우기. 파일은 avatars 버킷의 `{userId}/`에 둡니다(00014).
 *
 * 순서 규칙은 표지(`bookImageHandlers()`)와 같습니다 — 새 파일 → 프로필 행 →
 * 옛 파일. 옛 파일을 먼저 지우면 갱신이 실패했을 때 사진이 깨집니다.
 */

const ALLOWED_IMAGE_TYPES: readonly ImageMime[] = ["image/jpeg", "image/png", "image/webp"];

const UPLOAD_FAILED = "사진을 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type CurrentAvatar = { ok: true; url: string | null } | { ok: false; response: Response };

async function loadCurrentAvatar(
  supabase: Supabase,
  userId: string,
  failure: string,
): Promise<CurrentAvatar> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("avatar_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    console.error("[my/avatar] 프로필을 읽지 못했습니다", { userId, error });
    return { ok: false, response: apiError(failure, "SERVER_ERROR", 500) };
  }
  return { ok: true, url: (data.avatar_url as string | null) ?? null };
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const supabase = await createClient();
  const current = await loadCurrentAvatar(supabase, user.id, UPLOAD_FAILED);
  if (!current.ok) return current.response;

  const upload = await readImageUpload(request, ALLOWED_IMAGE_TYPES, "JPEG, PNG, WebP");
  if (!upload.ok) return apiError(upload.message, "UPLOAD_ERROR", upload.status);

  const storagePath = `${user.id}/${Date.now()}.${upload.extension}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(storagePath, upload.bytes, { contentType: upload.mime, upsert: false });

  if (uploadError) {
    console.error("[my/avatar] 파일을 올리지 못했습니다", { userId: user.id, uploadError });
    return apiError(UPLOAD_FAILED, "UPLOAD_ERROR", 500);
  }

  const { data: urlData } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(storagePath);
  const avatarUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (updateError) {
    console.error("[my/avatar] 프로필에 사진을 기록하지 못했습니다", { userId: user.id, updateError });
    await removeAvatarFile(supabase, avatarUrl, user.id);
    return apiError(UPLOAD_FAILED, "SERVER_ERROR", 500);
  }

  if (current.url && current.url !== avatarUrl) {
    await removeAvatarFile(supabase, current.url, user.id);
  }

  return apiSuccess({ avatar_url: avatarUrl });
}

/** 삭제. 프로필 행을 먼저 비우고, 성공한 뒤에 파일을 지웁니다. */
export async function DELETE() {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const failed = "사진을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  const supabase = await createClient();
  const current = await loadCurrentAvatar(supabase, user.id, failed);
  if (!current.ok) return current.response;

  if (!current.url) return apiSuccess({ deleted: false });

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (updateError) {
    console.error("[my/avatar] 사진을 지우지 못했습니다", { userId: user.id, updateError });
    return apiError(failed, "SERVER_ERROR", 500);
  }

  // 예전에 직접 입력한 외부 URL이면 removeAvatarFile이 건드리지 않습니다.
  await removeAvatarFile(supabase, current.url, user.id);

  return apiSuccess({ deleted: true });
}
