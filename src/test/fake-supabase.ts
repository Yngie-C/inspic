/**
 * API 라우트 테스트용 가짜 Supabase 클라이언트.
 *
 * 쿼리 빌더 체인(`from().select().eq()...`)을 그대로 받아 기록하고,
 * 끝(`single()`이나 `await`)에서 `respond`가 정한 결과를 돌려줍니다.
 * RLS나 SQL은 흉내 내지 않습니다 — 그건 `src/lib/supabase/__tests__/`의
 * PGlite 하네스가 봅니다. 여기서 보는 것은 라우트가 결과·에러를 어떻게
 * 다루는지입니다.
 */

export type QueryResult = { data: unknown; error: { message: string } | null };

export type RecordedQuery = {
  table: string;
  /** 호출된 빌더 메서드 이름 순서. 예: ["select", "eq", "single"] */
  ops: string[];
  /** 메서드별 첫 인자. 같은 메서드가 여러 번이면 마지막 것. */
  args: Record<string, unknown>;
};

export function createFakeSupabase(
  respond: (query: RecordedQuery) => QueryResult,
) {
  const queries: RecordedQuery[] = [];

  function from(table: string) {
    const query: RecordedQuery = { table, ops: [], args: {} };
    queries.push(query);

    const builder: Record<string, unknown> = {};
    for (const method of [
      "select",
      "insert",
      "update",
      "upsert",
      "delete",
      "eq",
      "in",
      "order",
    ]) {
      builder[method] = (...args: unknown[]) => {
        query.ops.push(method);
        query.args[method] = args[0];
        return builder;
      };
    }
    for (const terminal of ["single", "maybeSingle"]) {
      builder[terminal] = () => {
        query.ops.push(terminal);
        return Promise.resolve(respond(query));
      };
    }
    builder.then = (
      resolve: (value: QueryResult) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(respond(query)).then(resolve, reject);

    return builder;
  }

  return { client: { from }, queries };
}

export const OK_EMPTY: QueryResult = { data: null, error: null };
