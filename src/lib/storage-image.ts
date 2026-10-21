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
