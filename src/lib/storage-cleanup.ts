import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Storage 파일 정리. 표지 교체·삭제, 장·책 삭제 뒤에 부릅니다.
 *
 * 전부 DB가 바뀐 **뒤에** 부르고, 실패해도 던지지 않습니다. 파일을 먼저
 * 지웠는데 DB 갱신이 실패하면 책이 없는 파일을 가리켜 표지·본문 이미지가
 * 깨집니다(코드 리뷰 5-P1-7). 반대 순서에서 정리가 실패하면 남는 것은 아무도
 * 가리키지 않는 파일 하나이고, 로그로 찾을 수 있습니다.
 */

export const COVERS_BUCKET = "covers";
export const CHAPTER_IMAGES_BUCKET = "chapter-images";

const LIST_PAGE = 1000;

/**
 * 표지 공개 URL에서 `covers` 버킷 안의 경로를 꺼냅니다.
 *
 * 이 책의 폴더(`covers/{bookId}/`) 안이 아니면 null입니다. `cover_image_url`이
 * 다른 책의 파일을 가리키고 있어도(예전에는 책 PUT으로 아무 URL이나 넣을 수
 * 있었습니다) 그 파일을 지우지 않게 합니다.
 */
export function coverStoragePath(url: string, bookId: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const marker = `/storage/v1/object/public/${COVERS_BUCKET}/`;
  const at = pathname.indexOf(marker);
  if (at === -1) return null;

  let path: string;
  try {
    path = decodeURIComponent(pathname.slice(at + marker.length));
  } catch {
    return null;
  }
  const folder = `covers/${bookId}/`;
  if (!path.startsWith(folder) || path.length === folder.length) return null;
  if (path.split("/").some((part) => part === ".." || part === ".")) return null;
  return path;
}

/** 표지 파일 하나를 지웁니다. 이 책의 표지가 아니면 아무것도 하지 않습니다. */
export async function removeCoverFile(
  supabase: SupabaseClient,
  url: string | null | undefined,
  bookId: string,
): Promise<void> {
  if (!url) return;
  const path = coverStoragePath(url, bookId);
  if (!path) return;

  const { error } = await supabase.storage.from(COVERS_BUCKET).remove([path]);
  if (error) {
    console.error("[storage] 표지 파일을 지우지 못했습니다", { bookId, path, error });
  }
}

async function listFiles(
  admin: SupabaseClient,
  folder: string,
): Promise<{ files: string[]; folders: string[] }> {
  const files: string[] = [];
  const folders: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await admin.storage
      .from(CHAPTER_IMAGES_BUCKET)
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
 * `chapterId`가 null이면 책 폴더 전체입니다.
 */
export async function removeChapterImages(
  bookId: string,
  chapterId: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const root = chapterId ? `${bookId}/${chapterId}` : bookId;
    const top = await listFiles(admin, root);
    const files = [...top.files];
    for (const folder of top.folders) {
      files.push(...(await listFiles(admin, folder)).files);
    }

    const unreferenced: string[] = [];
    for (const path of files) {
      // 파일명(nanoid)에 든 `_`는 LIKE에서 아무 글자나 맞습니다. 틀리는
      // 방향은 "가리킨다"로만 틀려 파일이 남을 뿐입니다.
      const { data, error } = await admin
        .from("chapters")
        .select("id")
        .like("content_html", `%/${CHAPTER_IMAGES_BUCKET}/${path}%`)
        .limit(1);
      if (error) throw error;
      if (!data || data.length === 0) unreferenced.push(path);
    }

    for (let i = 0; i < unreferenced.length; i += LIST_PAGE) {
      const { error } = await admin.storage
        .from(CHAPTER_IMAGES_BUCKET)
        .remove(unreferenced.slice(i, i + LIST_PAGE));
      if (error) throw error;
    }
  } catch (error) {
    console.error("[storage] 본문 이미지를 정리하지 못했습니다", { bookId, chapterId, error });
  }
}

/** 지운 책의 표지와 본문 이미지를 지웁니다. 책 행을 지운 뒤에 부르세요. */
export async function removeBookFiles(
  bookId: string,
  coverUrl: string | null | undefined,
): Promise<void> {
  try {
    await removeCoverFile(createAdminClient(), coverUrl, bookId);
  } catch (error) {
    console.error("[storage] 표지 파일을 지우지 못했습니다", { bookId, error });
  }
  await removeChapterImages(bookId, null);
}
