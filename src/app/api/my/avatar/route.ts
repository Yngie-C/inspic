import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { readImageUpload } from "@/lib/image-upload";
import {
  AVATARS_BUCKET,
  avatarStoragePath,
  removeStaleAvatarFiles,
} from "@/lib/storage-cleanup";
import {
  clearStoredImage,
  replaceStoredImage,
  STORED_IMAGE_TYPES,
  STORED_IMAGE_TYPES_LABEL,
  type StoredImageTarget,
} from "@/lib/stored-image";

/**
 * 내 프로필 사진 올리기/지우기. 파일은 avatars 버킷의 `{userId}/`에 둡니다(00014).
 *
 * 순서 규칙과 겹친 요청 처리는 표지와 같은 `lib/stored-image.ts`입니다 — 새 파일 →
 * 프로필 행 → 옛 파일. `avatar_url`은 사용자 권한으로 바꿀 수 없어서(00015 트리거)
 * 그 갱신만 admin 클라이언트로 씁니다. 대상은 로그인한 본인 행(`user_id = user.id`)뿐입니다.
 */

const UPLOAD_FAILED = "사진을 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.";
const REMOVE_FAILED = "사진을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.";

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

const targetFor = (userId: string): StoredImageTarget => ({
  table: "user_profiles",
  key: { column: "user_id", value: userId },
  column: "avatar_url",
  bucket: AVATARS_BUCKET,
  // 예전에 직접 입력한 외부 URL이면 null — 건드리지 않습니다.
  pathOf: (url) => avatarStoragePath(url, userId),
  sweep: (admin, keepPath) => removeStaleAvatarFiles(admin, userId, keepPath),
  notFound: "프로필을 찾을 수 없어요.",
  logTag: "my/avatar",
});

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const supabase = await createClient();
  // 환경변수가 빠져 있으면 파일을 올리기 전에 실패하게 먼저 만듭니다.
  const admin = createAdminClient();
  const current = await loadCurrentAvatar(supabase, user.id, UPLOAD_FAILED);
  if (!current.ok) return current.response;

  const upload = await readImageUpload(request, STORED_IMAGE_TYPES, STORED_IMAGE_TYPES_LABEL);
  if (!upload.ok) return apiError(upload.message, "UPLOAD_ERROR", upload.status);

  const result = await replaceStoredImage({
    supabase,
    admin,
    target: targetFor(user.id),
    current: current.url,
    upload,
    path: `${user.id}/${crypto.randomUUID()}.${upload.extension}`,
    failed: UPLOAD_FAILED,
  });
  if (!result.ok) return result.response;

  return apiSuccess({ avatar_url: result.value });
}

/** 삭제. 프로필 행을 먼저 비우고, 성공한 뒤에 파일을 지웁니다. */
export async function DELETE() {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const supabase = await createClient();
  // 환경변수가 빠져 있으면 DB에 묻기 전에 실패하게 먼저 만듭니다.
  const admin = createAdminClient();
  const current = await loadCurrentAvatar(supabase, user.id, REMOVE_FAILED);
  if (!current.ok) return current.response;

  const result = await clearStoredImage({
    admin,
    target: targetFor(user.id),
    current: current.url,
    failed: REMOVE_FAILED,
  });
  if (!result.ok) return result.response;

  return apiSuccess({ deleted: result.value });
}
