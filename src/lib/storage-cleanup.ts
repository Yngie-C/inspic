import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAllRows } from "@/lib/supabase/read-all";
import { CHAPTER_IMAGES_BUCKET, storagePublicPath } from "@/lib/storage-image";

/**
 * Storage 파일 정리. 표지·프로필 사진 교체·삭제, 장·책 삭제 뒤에 부릅니다.
 *
 * 전부 DB가 바뀐 **뒤에** 부르고, 실패해도 던지지 않습니다. 파일을 먼저
 * 지웠는데 DB 갱신이 실패하면 책이 없는 파일을 가리켜 표지·본문 이미지가
 * 깨집니다(코드 리뷰 5-P1-7). 반대 순서에서 정리가 실패하면 남는 것은 아무도
 * 가리키지 않는 파일 하나이고, 로그로 찾을 수 있습니다.
 */

export const COVERS_BUCKET = "covers";
// 버킷 이름은 sanitize(브라우저에서도 돕니다)와 함께 쓰므로 `storage-image.ts`에 둡니다.
export { CHAPTER_IMAGES_BUCKET };
export const AVATARS_BUCKET = "avatars";

/** 소개 이미지 파일명 앞머리(00013). 표지는 앞머리가 없습니다. */
export const DETAIL_IMAGE_PREFIX = "detail-";

const LIST_PAGE = 1000;

/**
 * 우리 Storage 공개 URL에서 `bucket` 안의 경로를 꺼냅니다. `folder`(끝에 `/`)
 * 안의 파일이 아니면 null입니다.
 *
 * 우리 origin이 아니면 null입니다. 예전에는 pathname 어디서든 버킷 경로를 찾아,
 * 남의 호스트 URL이 우리 Storage의 같은 경로 파일을 지웠습니다(코드 리뷰 10-P1-14).
 */
function publicObjectPath(url: string, bucket: string, folder: string): string | null {
  const inStorage = storagePublicPath(url);
  const marker = `${bucket}/`;
  if (inStorage === null || !inStorage.startsWith(marker)) return null;

  let path: string;
  try {
    path = decodeURIComponent(inStorage.slice(marker.length));
  } catch {
    return null;
  }
  if (!path.startsWith(folder) || path.length === folder.length) return null;
  if (path.split("/").some((part) => part === ".." || part === ".")) return null;
  return path;
}

export type BookImageKind = "cover" | "detail";

/**
 * 표지·소개 이미지 공개 URL에서 `covers` 버킷 안의 경로를 꺼냅니다.
 *
 * 이 책의 폴더(`covers/{bookId}/`) 안이 아니면 null입니다. `cover_image_url`이
 * 다른 책의 파일을 가리키고 있어도(예전에는 책 PUT으로 아무 URL이나 넣을 수
 * 있었습니다) 그 파일을 지우지 않게 합니다. 같은 폴더의 다른 종류 파일도
 * null입니다 — 표지 칸이 예전 입력으로 `detail-*` 파일을 가리키면 표지를 바꿀 때
 * 소개 이미지가 지워졌습니다(코드 리뷰 10-P1-13).
 */
export function coverStoragePath(
  url: string,
  bookId: string,
  kind: BookImageKind,
): string | null {
  const folder = `covers/${bookId}/`;
  const path = publicObjectPath(url, COVERS_BUCKET, folder);
  if (!path) return null;
  const isDetail = path.slice(folder.length).startsWith(DETAIL_IMAGE_PREFIX);
  return isDetail === (kind === "detail") ? path : null;
}

/**
 * 프로필 사진 공개 URL에서 `avatars` 버킷 안의 경로를 꺼냅니다.
 *
 * 본인 폴더(`{userId}/`) 안이 아니면 null입니다. 예전에는 `avatar_url`에
 * 아무 URL이나 넣을 수 있었습니다.
 */
export function avatarStoragePath(url: string, userId: string): string | null {
  return publicObjectPath(url, AVATARS_BUCKET, `${userId}/`);
}

/**
 * 파일을 지우고, 지워지지 않은 경로를 로그로 남깁니다. 던지지 않습니다.
 *
 * `remove()`는 정책이 막았거나 파일이 없으면 에러 없이 빈 목록을 돌려줍니다.
 * `error`만 보면 지우지 못한 파일이 소리 없이 남습니다(코드 리뷰 10-P1-16).
 */
async function removeObjects(
  admin: SupabaseClient,
  bucket: string,
  paths: readonly string[],
  context: Record<string, unknown>,
): Promise<void> {
  for (let i = 0; i < paths.length; i += LIST_PAGE) {
    const chunk = paths.slice(i, i + LIST_PAGE);
    const { data, error } = await admin.storage.from(bucket).remove(chunk);
    if (error) {
      console.error("[storage] 파일을 지우지 못했습니다", { ...context, bucket, paths: chunk, error });
      continue;
    }
    const gone = new Set((data ?? []).map((entry) => entry.name));
    const left = chunk.filter((path) => !gone.has(path));
    if (left.length > 0) {
      console.error("[storage] 지워지지 않은 파일이 있습니다", { ...context, bucket, paths: left });
    }
  }
}

/** 막 올라와 아직 행에 기록되기 전일 수 있는 파일은 남깁니다. */
const STALE_AVATAR_MS = 10 * 60 * 1000;

/**
 * 본인 폴더에서 행이 가리키지 않는 옛 사진을 지웁니다. 교체·삭제가 성공한 뒤에
 * 부릅니다. 반영 여부를 몰라 남긴 파일(코드 리뷰 10-P1-10)은 아바타에서 거둘
 * 경로가 따로 없어, 다음 교체·삭제 때 함께 지웁니다 — 지웠다고 믿는 사진이 공개
 * URL로 남지 않게. 다른 요청이 방금 올린 파일을 지우지 않도록 10분 지난 것만 봅니다.
 */
export async function removeStaleAvatarFiles(
  admin: SupabaseClient,
  userId: string,
  keepPath: string | null,
): Promise<void> {
  const { data, error } = await admin.storage
    .from(AVATARS_BUCKET)
    .list(userId, { limit: LIST_PAGE });
  if (error) {
    console.error("[storage] 프로필 사진 폴더를 읽지 못했습니다", { userId, error });
    return;
  }
  const cutoff = Date.now() - STALE_AVATAR_MS;
  const stale = (data ?? [])
    .filter((entry) => entry.id && Date.parse(entry.created_at) < cutoff)
    .map((entry) => `${userId}/${entry.name}`)
    .filter((path) => path !== keepPath);
  if (stale.length === 0) return;

  await removeObjects(admin, AVATARS_BUCKET, stale, { userId });
}

async function listFiles(
  admin: SupabaseClient,
  bucket: string,
  folder: string,
): Promise<{ files: string[]; folders: string[] }> {
  const files: string[] = [];
  const folders: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(folder, { limit: LIST_PAGE, offset });
    if (error) throw error;
    for (const entry of data ?? []) {
      // 폴더는 id가 없습니다.
      if (entry.id) files.push(`${folder}/${entry.name}`);
      else folders.push(`${folder}/${entry.name}`);
    }
    if (!data || data.length < LIST_PAGE) break;
  }
  return { files, folders };
}

/**
 * `files` 중 아직 어느 장 본문이 가리키는 것. 이 책 폴더를 가리키는 장을 한 번에
 * 읽어 대조합니다 — 파일마다 전체 장에 LIKE를 돌리면 이미지가 많은 책에서 전 테이블
 * 스캔을 수백 번 하고, 장·책 DELETE가 그것을 기다렸습니다(코드 리뷰 10-P1-18).
 *
 * 다른 책의 장도 봅니다. 이미지를 복사해 다른 책에 붙이면 URL이 원래 책의 폴더를
 * 그대로 가리킵니다.
 */
async function referencedFiles(
  admin: SupabaseClient,
  bookId: string,
  files: readonly string[],
): Promise<Set<string>> {
  const marker = `/${CHAPTER_IMAGES_BUCKET}/`;
  const result = await readAllRows<{ content_html: string | null }>((from, to) =>
    admin
      .from("chapters")
      .select("id, content_html")
      // bookId는 UUID라 LIKE 특수문자(`%`, `_`)가 없습니다.
      .like("content_html", `%${marker}${bookId}/%`)
      .order("id")
      .range(from, to),
  );
  if (result.error) throw result.error;

  const referenced = new Set<string>();
  for (const { content_html: html } of result.data) {
    if (!html) continue;
    for (const path of files) {
      if (!referenced.has(path) && html.includes(`${marker}${path}`)) referenced.add(path);
    }
  }
  return referenced;
}

/**
 * 지운 장(또는 책)의 본문 이미지를 지웁니다 — `chapter-images/{bookId}/{chapterId}/`.
 *
 * 버킷이 공개라 남겨 두면 유료 책의 이미지가 공개 URL로 계속 열립니다
 * (코드 리뷰 5-P2-11).
 *
 * 다만 **아직 다른 장 본문이 가리키는 파일은 남깁니다.** 이미지를 복사해 다른
 * 장·책에 붙이면 URL이 원래 장의 폴더를 그대로 가리키므로, 폴더째 지우면 살아
 * 있는 장의 이미지가 깨집니다. 다른 책의 본문까지 봐야 해서 admin 클라이언트로
 * 봅니다. 책을 지운 뒤에는 소유자 정책(`is_book_owner`)도 더는 통과하지 않습니다.
 *
 * 판정은 DB에 저장된 본문만 봅니다. 붙여 넣고 아직 자동 저장되지 않은 장은 모릅니다
 * (코드 리뷰 10-P1-17) — 라우트가 응답 뒤(`after()`)에 불러 그 틈을 줄입니다(결정 3).
 *
 * `chapterId`가 null이면 책 폴더 전체입니다.
 */
export async function removeChapterImages(
  bookId: string,
  chapterId: string | null,
  client?: SupabaseClient,
): Promise<void> {
  try {
    const admin = client ?? createAdminClient();
    const root = chapterId ? `${bookId}/${chapterId}` : bookId;
    const top = await listFiles(admin, CHAPTER_IMAGES_BUCKET, root);
    const nested = await Promise.all(
      top.folders.map((folder) => listFiles(admin, CHAPTER_IMAGES_BUCKET, folder)),
    );
    const files = [...top.files, ...nested.flatMap((listed) => listed.files)];
    if (files.length === 0) return;

    const referenced = await referencedFiles(admin, bookId, files);
    const unreferenced = files.filter((path) => !referenced.has(path));
    await removeObjects(admin, CHAPTER_IMAGES_BUCKET, unreferenced, { bookId, chapterId });
  } catch (error) {
    console.error("[storage] 본문 이미지를 정리하지 못했습니다", { bookId, chapterId, error });
  }
}

/**
 * 지운 책의 파일을 지웁니다. 책 행을 지운 뒤에 부르세요.
 *
 * covers는 행의 URL이 아니라 `covers/{bookId}/` 폴더를 통째로 비웁니다. 예전
 * 교체 때 지우지 못했거나 반영 여부를 몰라 남긴 파일은 행이 가리키지 않아, 책이
 * 사라진 뒤에는 누구도 지울 수 없는 공개 파일로 남았습니다(코드 리뷰 10-P1-15).
 */
export async function removeBookFiles(bookId: string): Promise<void> {
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("[storage] 책 파일을 정리하지 못했습니다", { bookId, error });
    return;
  }

  await Promise.all([
    (async () => {
      try {
        const { files } = await listFiles(admin, COVERS_BUCKET, `covers/${bookId}`);
        await removeObjects(admin, COVERS_BUCKET, files, { bookId });
      } catch (error) {
        console.error("[storage] 표지 폴더를 정리하지 못했습니다", { bookId, error });
      }
    })(),
    removeChapterImages(bookId, null, admin),
  ]);
}
