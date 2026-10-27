/**
 * next/image로 최적화해도 되는 이미지 URL인지. `next.config.ts`의
 * `remotePatterns`와 같은 판정입니다 — 우리 Supabase Storage 공개 버킷.
 *
 * 아니면 `unoptimized`로 그립니다. 예전에는 표지·프로필 사진에 아무 URL이나
 * 넣을 수 있었고, 등록되지 않은 호스트를 next/image에 넘기면 화면이 통째로
 * 깨집니다.
 */
export function isStorageImageUrl(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  try {
    const target = new URL(url);
    const storage = new URL(base);
    return (
      target.origin === storage.origin &&
      target.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
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
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  try {
    const target = new URL(url);
    const prefix = `/storage/v1/object/public/${CHAPTER_IMAGES_BUCKET}/`;
    return (
      target.origin === new URL(base).origin &&
      target.pathname.startsWith(prefix) &&
      target.pathname.length > prefix.length
    );
  } catch {
    return false;
  }
}
