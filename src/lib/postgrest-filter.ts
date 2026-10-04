/**
 * 사용자가 친 검색어를 PostgREST `.or()` 필터 문자열에 넣는 법.
 *
 * `.or()`는 문자열을 그대로 PostgREST 문법으로 읽습니다. 검색어를 그대로
 * 붙이면 `,`·`(`·`)`·`.`이 문법으로 해석돼 "C++, Python" 검색이 500이 되고,
 * 조작한 검색어로 OR 조건을 덧붙일 수 있었습니다(코드 리뷰 7-P1-7).
 *
 * 두 겹으로 감쌉니다.
 * 1. LIKE 패턴: `%`·`_`·`\`를 `\`로 이스케이프해 글자 그대로 찾습니다
 *    (Postgres LIKE의 기본 이스케이프 문자가 `\`).
 * 2. PostgREST 값: 큰따옴표로 감싸면 예약 문자가 값의 일부가 되고, 그 안의
 *    `"`·`\`는 `\`로 이스케이프합니다.
 *
 * `*`는 PostgREST가 like 값에서 `%`로 바꾸므로 글자 그대로 찾을 수 없습니다.
 * 더 넓게 찾을 뿐 다른 조건을 만들지는 못합니다.
 */
export function ilikeAnyFilter(columns: readonly string[], term: string): string {
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const quoted = `"${pattern.replace(/["\\]/g, "\\$&")}"`;
  return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
}
