/**
 * API 라우트 테스트용 가짜 Supabase 클라이언트.
 *
 * 쿼리 빌더 체인(`from().select().eq()...`)을 그대로 받아 기록하고,
 * 끝(`single()`이나 `await`)에서 `respond`가 정한 결과를 돌려줍니다.
 * RLS나 SQL은 흉내 내지 않습니다 — 그건 `src/lib/supabase/__tests__/`의
 * PGlite 하네스가 봅니다. 여기서 보는 것은 라우트가 결과·에러를 어떻게
 * 다루는지입니다.
 */

export type QueryResult = {
  data: unknown;
  /** `code`는 Postgres SQLSTATE (예: 23503 FK 위반). */
  error: { message: string; code?: string } | null;
};

export type RecordedQuery = {
  table: string;
  /** 호출된 빌더 메서드 이름 순서. 예: ["select", "eq", "single"] */
  ops: string[];
  /** 메서드별 첫 인자. 같은 메서드가 여러 번이면 마지막 것. */
  args: Record<string, unknown>;
  /** 메서드별 인자 전체. `like("content_html", 패턴)`처럼 둘째 인자가 필요할 때. */
  argLists: Record<string, unknown[]>;
  /** 빌더 호출 전부를 순서대로. `order`처럼 여러 번 부르는 메서드를 볼 때. */
  calls?: { method: string; args: unknown[] }[];
};

export function createFakeSupabase(
  respond: (query: RecordedQuery) => QueryResult,
) {
  const queries: RecordedQuery[] = [];

  function from(table: string) {
    return builderFor({ table, ops: [], args: {}, argLists: {} });
  }

  /** RPC는 `table`을 `rpc:{함수}`로, 인자를 `args.rpc`로 기록합니다. */
  function rpc(fn: string, params?: unknown) {
    return builderFor({
      table: `rpc:${fn}`,
      ops: ["rpc"],
      args: { rpc: params },
      argLists: { rpc: [params] },
    });
  }

  function builderFor(query: RecordedQuery) {
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
      "like",
      "or",
      "gt",
      "lte",
      "order",
      "limit",
      "range",
    ]) {
      builder[method] = (...args: unknown[]) => {
        query.ops.push(method);
        query.args[method] = args[0];
        query.argLists[method] = args;
        (query.calls ??= []).push({ method, args });
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

  /**
   * Storage는 `table`을 `storage:{버킷}`으로 기록합니다. 호출 순서가
   * DB 쿼리와 한 목록에 섞여 남아서 "DB를 먼저 바꾸고 파일을 지운다" 같은
   * 순서를 볼 수 있습니다. `getPublicUrl`만 동기이고 기록하지 않습니다.
   */
  const storage = {
    from(bucket: string) {
      const call =
        (method: string) =>
        (...args: unknown[]) => {
          const query: RecordedQuery = {
            table: `storage:${bucket}`,
            ops: [method],
            args: { [method]: args[0] },
            argLists: { [method]: args },
          };
          queries.push(query);
          return Promise.resolve(respond(query));
        };
      return {
        upload: call("upload"),
        remove: call("remove"),
        list: call("list"),
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://project.supabase.co/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
      };
    },
  };

  return { client: { from, rpc, storage }, queries };
}

export const OK_EMPTY: QueryResult = { data: null, error: null };
