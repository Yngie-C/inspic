/**
 * 로그인 후 돌아갈 곳을 고릅니다.
 *
 * 이 값은 URL 쿼리에서 오므로 누구나 넣을 수 있습니다. 그대로 쓰면
 * `https://secrettome.example/auth/login?redirect=https://피싱주소`로 유도해
 * 로그인 직후 남의 사이트로 보낼 수 있습니다 (오픈 리다이렉트).
 *
 * 그래서 같은 사이트 안의 경로만 통과시킵니다. 문자열 모양으로 거르지
 * 말고 브라우저와 같은 규칙으로 해석해 보고 판정하세요. `//evil.com`만
 * 막으면 `/\evil.com`(브라우저는 `\`를 `/`로 읽음)이나 `/<탭>/evil.com`
 * (탭·줄바꿈은 지워짐)이 그대로 통과해 외부로 나갑니다.
 *
 * 돌려주는 값은 해석한 결과(경로 + 쿼리 + 해시)입니다. 검사한 것과
 * 쓰는 것이 같은 문자열이어야 하기 때문입니다. 그래서 origin만 보지 말고
 * 해석한 경로도 보세요. `/..//evil.com`은 origin이 그대로인 채 점 구간이
 * 정리되어 `//evil.com`이 되고, 그 문자열을 쓰는 순간 외부로 나갑니다
 * (코드 리뷰 13-P0-1).
 */
const INTERNAL_BASE = "http://internal.invalid";

export function safeInternalPath(raw: string | null, fallback: string): string {
  if (!raw || !raw.startsWith("/")) return fallback;

  let url: URL;
  try {
    url = new URL(raw, INTERNAL_BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== INTERNAL_BASE) return fallback;
  // 해석 뒤에는 `\`가 `/`로 바뀌어 있으므로 `//`만 보면 됩니다.
  if (url.pathname.startsWith("//")) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * 인증 화면의 `?redirect=` 쿼리를 읽습니다. 통과하지 못하면 null — 로그인·가입
 * 화면은 돌아갈 곳이 없을 때 각자의 기본 이동을 씁니다.
 */
export function readRedirectParam(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" ? safeInternalPath(raw, "") || null : null;
}

/**
 * 인증 화면 사이를 오갈 때 돌아갈 곳을 함께 싣습니다. 로그인 ↔ 가입을
 * 오가거나 가입 메일을 거쳐도 보던 책으로 돌아오게 하기 위해서입니다.
 * `redirect`는 `safeInternalPath()`를 거친 값이어야 합니다.
 */
export function withRedirect(path: string, redirect: string | null): string {
  if (!redirect) return path;
  return `${path}?${new URLSearchParams({ redirect })}`;
}
