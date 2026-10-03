/**
 * 로그인 후 돌아갈 곳을 고릅니다.
 *
 * 이 값은 URL 쿼리에서 오므로 누구나 넣을 수 있습니다. 그대로 쓰면
 * `https://inspic.example/auth/login?redirect=https://피싱주소`로 유도해
 * 로그인 직후 남의 사이트로 보낼 수 있습니다 (오픈 리다이렉트).
 *
 * 그래서 같은 사이트 안의 경로만 통과시킵니다. 문자열 모양으로 거르지
 * 말고 브라우저와 같은 규칙으로 해석해 보고 판정하세요. `//evil.com`만
 * 막으면 `/\evil.com`(브라우저는 `\`를 `/`로 읽음)이나 `/<탭>/evil.com`
 * (탭·줄바꿈은 지워짐)이 그대로 통과해 외부로 나갑니다.
 *
 * 돌려주는 값은 해석한 결과(경로 + 쿼리 + 해시)입니다. 검사한 것과
 * 쓰는 것이 같은 문자열이어야 하기 때문입니다.
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

  return `${url.pathname}${url.search}${url.hash}`;
}
