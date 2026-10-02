// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  OK_EMPTY,
  type QueryResult,
  type RecordedQuery,
} from "@/test/fake-supabase";

/**
 * 내 서재와 구매 내역 (코드 리뷰 1-P1 "구매 목록").
 *
 * - 조회 실패가 200 + 빈 목록이면 결제한 독자에게 "아직 구매한 책이
 *   없어요"가 뜹니다.
 * - 서재는 지금 읽을 수 있는 책(completed)만, 내역은 환불·실패까지.
 */

const USER = "user-1";

const mocks = vi.hoisted(() => ({
  respond: (() => ({ data: null, error: null })) as (query: RecordedQuery) => QueryResult,
  queries: [] as RecordedQuery[],
}));

vi.mock("@/lib/supabase/server", async () => {
  const { createFakeSupabase } = await import("@/test/fake-supabase");
  return {
    createClient: async () => {
      const fake = createFakeSupabase((query) => mocks.respond(query));
      mocks.queries = fake.queries;
      return fake.client;
    },
  };
});

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  getAuthUser: async () => ({ id: USER }),
}));

const { GET } = await import("./route");

function request(query = ""): NextRequest {
  return new Request(`http://localhost/api/purchases${query}`) as unknown as NextRequest;
}

/** purchases 조회에 걸린 `eq` 횟수. user_id 하나면 상태로 거르지 않은 것. */
function purchaseFilterCount(): number {
  const query = mocks.queries.find((q) => q.table === "purchases");
  return query?.ops.filter((op) => op === "eq").length ?? 0;
}

beforeEach(() => {
  mocks.respond = () => ({ data: [], error: null });
});

describe("GET /api/purchases", () => {
  it("조회가 실패하면 500 — 빈 서재로 보이지 않는다", async () => {
    mocks.respond = (query) =>
      query.table === "purchases"
        ? { data: null, error: { message: "relation does not exist" } }
        : OK_EMPTY;

    const res = await GET(request());

    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain("relation");
  });

  it("서재는 completed 구매만 거른다", async () => {
    await GET(request());

    const query = mocks.queries.find((q) => q.table === "purchases");
    expect(purchaseFilterCount()).toBe(2);
    expect(query?.args.eq).toBe("status");
  });

  it("내역(scope=history)은 상태로 거르지 않는다 — 환불·실패 배지가 떠야 한다", async () => {
    await GET(request("?scope=history"));

    expect(purchaseFilterCount()).toBe(1);
  });

  it("저자 이름 조회가 실패해도 서재는 그린다", async () => {
    mocks.respond = (query) =>
      query.table === "purchases"
        ? {
            data: [{ id: "p-1", books: { id: "b-1", title: "산 책", owner_id: "author-1" } }],
            error: null,
          }
        : { data: null, error: { message: "timeout" } };

    const res = await GET(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data[0].books).toMatchObject({ title: "산 책", author_name: null });
  });
});
