import type { SupabaseClient } from "@supabase/supabase-js";
import { apiError } from "@/lib/api-utils";
import type { ImageMime, ImageUpload } from "@/lib/image-upload";

/**
 * 행 하나의 이미지 URL 컬럼을 바꾸거나 비우는 순서 규칙 한 벌입니다.
 * 표지·소개 이미지(`book-image-route.ts`)와 프로필 사진(`api/my/avatar`)이 함께 씁니다
 * (코드 리뷰 10-B).
 *
 * - 순서는 새 파일 → 행 → 옛 파일입니다. 옛 파일을 먼저 지우면 업로드나 갱신이
 *   실패했을 때 행이 지워진 파일을 가리킵니다(코드 리뷰 5-P1-7).
 * - 갱신에는 읽어 둔 옛 값을 조건으로 겁니다. 두 요청이 같은 옛 값을 읽고 둘 다
 *   바꾸면, 먼저 들어간 새 파일이 행도 정리 대상도 아닌 채 공개 URL로 남습니다
 *   (10-P1-5·P1-6). 0행이면 다시 읽어 "다른 곳에서 바뀜"(409)과 "행이 사라짐"(404)을
 *   가릅니다 — admin 갱신이라 행이 지워진 것도 에러가 아니라 0행으로 옵니다.
 * - 갱신이 에러면 커밋됐는데 응답만 잃었을 수 있습니다. 다시 읽어 새 URL을
 *   가리키면 성공으로 마무리하고, 확인하지 못하면 새 파일을 지우지 않습니다(10-P1-10).
 * - URL 컬럼 갱신과 파일 삭제는 admin 클라이언트입니다. 호출자는 그 전에 소유자를
 *   확인하고 `key`에 확인한 행의 키를 넘기세요 — admin 갱신은 RLS가 다시 보지 않습니다.
 *   삭제도 admin이라, 그 사이 책이 지워져 소유자 정책이 통과하지 않아도 방금 올린
 *   파일이 남지 않습니다(10-P1-11).
 */

/** 표지·소개 이미지·프로필 사진이 받는 형식. */
export const STORED_IMAGE_TYPES: readonly ImageMime[] = ["image/jpeg", "image/png", "image/webp"];
export const STORED_IMAGE_TYPES_LABEL = "JPEG, PNG, WebP";

export interface StoredImageTarget {
  table: "books" | "user_profiles";
  /** 소유자 확인을 마친 행의 키. */
  key: { column: "id" | "user_id"; value: string };
  /** URL 컬럼. */
  column: string;
  /** 이미지가 바뀌거나 비워질 때 함께 null로 만드는 컬럼(소개 이미지의 대체 글). */
  resetColumns?: readonly string[];
  bucket: string;
  /** 지워도 되는 파일의 경로. 이 행의 폴더 밖 URL이면 null — 건드리지 않습니다. */
  pathOf: (url: string) => string | null;
  /** 성공한 뒤 폴더에 남은, 행이 가리키지 않는 파일을 지웁니다(프로필 사진). */
  sweep?: (admin: SupabaseClient, keepPath: string | null) => Promise<void>;
  /** 404 문구. */
  notFound: string;
  logTag: string;
}

export type StoredImageResult<T> = { ok: true; value: T } | { ok: false; response: Response };

const CHANGED_ELSEWHERE = "다른 곳에서 먼저 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.";

type Supabase = SupabaseClient;

function changes(target: StoredImageTarget, url: string | null): Record<string, string | null> {
  const values: Record<string, string | null> = { [target.column]: url };
  for (const column of target.resetColumns ?? []) values[column] = null;
  return values;
}

/** 옛 값이 그대로일 때만 바꿉니다. 바뀐 행이 없으면 data가 null입니다. */
function conditionalUpdate(
  admin: Supabase,
  target: StoredImageTarget,
  current: string | null,
  url: string | null,
) {
  const query = admin
    .from(target.table)
    .update(changes(target, url))
    .eq(target.key.column, target.key.value);
  const guarded = current === null ? query.is(target.column, null) : query.eq(target.column, current);
  return guarded.select(target.key.column).maybeSingle();
}

type Reread = { ok: true; exists: false } | { ok: true; exists: true; url: string | null } | { ok: false };

async function reread(admin: Supabase, target: StoredImageTarget): Promise<Reread> {
  const { data, error } = await admin
    .from(target.table)
    .select(target.column)
    .eq(target.key.column, target.key.value)
    .maybeSingle();
  if (error) {
    console.error(`[${target.logTag}] 행을 다시 읽지 못했습니다`, { key: target.key, error });
    return { ok: false };
  }
  if (!data) return { ok: true, exists: false };
  const row = data as unknown as Record<string, string | null>;
  return { ok: true, exists: true, url: row[target.column] ?? null };
}

async function removeFile(admin: Supabase, target: StoredImageTarget, url: string | null) {
  if (!url) return;
  const path = target.pathOf(url);
  if (!path) return;
  const { error } = await admin.storage.from(target.bucket).remove([path]);
  if (error) {
    console.error(`[${target.logTag}] 파일을 지우지 못했습니다`, { key: target.key, path, error });
  }
}

/**
 * 새 파일로 바꿉니다. `path`는 버킷 안의 새 경로(겹치지 않게 `crypto.randomUUID()`).
 * 업로드는 사용자 클라이언트로 해서 Storage 정책(내 폴더)을 한 번 더 거칩니다.
 */
export async function replaceStoredImage({
  supabase,
  admin,
  target,
  current,
  upload,
  path,
  failed,
}: {
  supabase: Supabase;
  admin: Supabase;
  target: StoredImageTarget;
  current: string | null;
  upload: Extract<ImageUpload, { ok: true }>;
  path: string;
  /** 500 문구. */
  failed: string;
}): Promise<StoredImageResult<string>> {
  const { error: uploadError } = await supabase.storage
    .from(target.bucket)
    .upload(path, upload.bytes, { contentType: upload.mime, upsert: false });
  if (uploadError) {
    console.error(`[${target.logTag}] 파일을 올리지 못했습니다`, { key: target.key, uploadError });
    return { ok: false, response: apiError(failed, "UPLOAD_ERROR", 500) };
  }

  const url = supabase.storage.from(target.bucket).getPublicUrl(path).data.publicUrl;
  const { data, error } = await conditionalUpdate(admin, target, current, url);

  if (error || !data) {
    const row = await reread(admin, target);
    if (error) {
      console.error(`[${target.logTag}] 행에 이미지를 기록하지 못했습니다`, { key: target.key, error });
    }
    if (!row.ok) {
      // 반영됐는지 모릅니다. 새 파일을 지우면 행이 지워진 파일을 가리킬 수 있어 남깁니다.
      console.error(`[${target.logTag}] 반영 여부를 모르는 파일을 남깁니다`, {
        key: target.key,
        bucket: target.bucket,
        path,
      });
      return { ok: false, response: apiError(failed, "SERVER_ERROR", 500) };
    }
    if (!(row.exists && row.url === url)) {
      await removeFile(admin, target, url);
      if (!row.exists) return { ok: false, response: apiError(target.notFound, "NOT_FOUND", 404) };
      if (error) return { ok: false, response: apiError(failed, "SERVER_ERROR", 500) };
      return { ok: false, response: apiError(CHANGED_ELSEWHERE, "STATE_CHANGED", 409) };
    }
    // 커밋됐는데 응답만 잃었습니다. 성공으로 마무리합니다.
  }

  await removeFile(admin, target, current);
  await target.sweep?.(admin, path);
  return { ok: true, value: url };
}

/** 비웁니다. 행을 먼저 비우고, 바뀐 것을 확인한 뒤에 파일을 지웁니다. */
export async function clearStoredImage({
  admin,
  target,
  current,
  failed,
}: {
  admin: Supabase;
  target: StoredImageTarget;
  current: string | null;
  /** 500 문구. */
  failed: string;
}): Promise<StoredImageResult<boolean>> {
  if (!current) return { ok: true, value: false };

  const { data, error } = await conditionalUpdate(admin, target, current, null);
  if (error) {
    console.error(`[${target.logTag}] 이미지를 비우지 못했습니다`, { key: target.key, error });
    return { ok: false, response: apiError(failed, "SERVER_ERROR", 500) };
  }
  if (!data) {
    // 바뀐 행이 없으면 파일을 지우지 않습니다. 행이 아직 그 파일을 가리킬 수 있습니다(10-P1-8).
    const row = await reread(admin, target);
    if (!row.ok) return { ok: false, response: apiError(failed, "SERVER_ERROR", 500) };
    if (!row.exists) return { ok: false, response: apiError(target.notFound, "NOT_FOUND", 404) };
    return { ok: false, response: apiError(CHANGED_ELSEWHERE, "STATE_CHANGED", 409) };
  }

  await removeFile(admin, target, current);
  await target.sweep?.(admin, null);
  return { ok: true, value: true };
}
