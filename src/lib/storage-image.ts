/**
 * 우리 Supabase Storage 공개 버킷의 위치 — `NEXT_PUBLIC_SUPABASE_URL`에서 꺼냅니다.
 *
 * "우리 Storage URL인가"는 이것 하나로 판정합니다. next/image 허용 목록
 * (`next.config.ts`), 최적화 여부(`isStorageImageUrl`), 본문 이미지
 * (`isChapterImageUrl`), 지울 파일 경로(`storage-cleanup.ts`)가 함께 씁니다 —
 * 따로 구현하면 한쪽은 받고 한쪽은 거절하거나, 남의 호스트 URL로 우리 파일을
 * 지웁니다(코드 리뷰 10-P1-14·P2-9).
 *
 * 환경변수가 없거나 읽을 수 없으면 null입니다. 브라우저에서도 돕니다.
 */
export function storageImageBase(): { url: URL; publicPath: string } | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return { url, publicPath: `${url.pathname.replace(/\/+$/, "")}/storage/v1/object/public/` };
  } catch {
    return null;
  }
}

/**
 * 우리 Storage 공개 버킷 안의 경로(`{bucket}/...`, 디코딩 전). 다른 origin이거나
 * 공개 경로가 아니면 null입니다.
 */
export function storagePublicPath(url: string): string | null {
  const base = storageImageBase();
  if (!base) return null;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.origin !== base.url.origin) return null;
  if (!target.pathname.startsWith(base.publicPath)) return null;
  return target.pathname.slice(base.publicPath.length);
}

/** next/image 최적화 서버가 받지 않는 주소(Next 16의 `dangerouslyAllowLocalIP` 기본값). */
function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * next/image로 최적화해도 되는 이미지 URL인지 — 우리 Supabase Storage 공개 버킷.
 *
 * 아니면 `unoptimized`로 그립니다. 예전에는 표지·프로필 사진에 아무 URL이나
 * 넣을 수 있었고, 등록되지 않은 호스트를 next/image에 넘기면 화면이 통째로
 * 깨집니다. 로컬 Supabase도 최적화하지 않습니다 — Next 16은 로컬 IP의 이미지를
 * 최적화하지 않아 로컬 개발에서 표지·사진이 전부 깨졌습니다(코드 리뷰 10-P2-11).
 */
export function isStorageImageUrl(url: string): boolean {
  const base = storageImageBase();
  if (!base || isLocalHost(base.url.hostname)) return false;
  return storagePublicPath(url) !== null;
}

/** 에디터 본문 이미지 버킷(마이그레이션 00002). 경로는 `{bookId}/{chapterId}/{파일명}`. */
export const CHAPTER_IMAGES_BUCKET = "chapter-images";

/**
 * 장 본문에 둘 수 있는 이미지 주소인지 — 우리 Supabase Storage의
 * `chapter-images` 공개 버킷뿐입니다(코드 리뷰 12 결정 2).
 *
 * sanitize(저장·렌더)와 내보내기(`loadStorageImage()`)가 이 함수 하나로
 * 판정합니다. 둘이 갈라지면 리더에 보이는 그림과 EPUB에 담기는 그림이
 * 달라집니다. 외부 주소는 구매 독자의 IP·읽은 시각을 밖으로 보내는 추적
 * 픽셀이 될 수 있고, 나중에 다른 그림으로 바꿔치기할 수 있습니다.
 *
 * 브라우저에서도 돕니다(`NEXT_PUBLIC_` 값만 씁니다).
 */
export function isChapterImageUrl(url: string): boolean {
  const path = storagePublicPath(url);
  const prefix = `${CHAPTER_IMAGES_BUCKET}/`;
  return path !== null && path.startsWith(prefix) && path.length > prefix.length;
}
