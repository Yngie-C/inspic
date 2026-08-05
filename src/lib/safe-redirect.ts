/**
 * 로그인 후 돌아갈 곳을 고릅니다.
 *
 * 이 값은 URL 쿼리에서 오므로 누구나 넣을 수 있습니다. 그대로 쓰면
 * `https://inspic.example/auth/login?redirect=https://피싱주소`로 유도해
 * 로그인 직후 남의 사이트로 보낼 수 있습니다 (오픈 리다이렉트).
 *
 * 그래서 같은 사이트 안의 경로만 통과시킵니다. `//`로 시작하는 것은
 * 프로토콜 상대 URL이라 외부로 나갑니다.
 */
export function safeInternalPath(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}
