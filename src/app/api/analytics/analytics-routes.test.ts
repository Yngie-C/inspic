// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { OK_EMPTY, type QueryResult, type RecordedQuery } from "@/test/fake-supabase";

/**
 * 크리에이터 분석 (코드 리뷰 7-P1-1~4, 7-P2-2).
 *
 * - 조회가 실패하면 500. 200 + 0원·"답한 사람 없음"은 실제 결과처럼 보입니다.
 * - 1000건을 넘는 구매·블록·집계 행을 끝까지 읽습니다.
 */

const USER = "user-1";
const BOOK = "book-1";

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

const sales = await import("./sales/route");
const workbook = await import("./workbook/route");

const FAIL: QueryResult = { data: null, error: { message: "timeout" } };

/**
 * `count`개의 행을 범위대로 잘라 돌려줍니다. `make(i)`가 i번째 행.
 * PostgREST처럼 범위가 없거나 넓어도 1000건(`max_rows`)까지만 줍니다.
 */
function paged(query: RecordedQuery, count: number, make: (i: number) => unknown): QueryResult {
  const [from, to] = (query.argLists.range ?? [0, Infinity]) as [number, number];
  const last = Math.min(to, from + 999, count - 1);
  const rows = [];
  for (let i = from; i <= last; i++) rows.push(make(i));
  return { data: rows, error: null };
}

function workbookRequest(): NextRequest {
  return new Request(`http://localhost/api/analytics/workbook?bookId=${BOOK}`) as unknown as NextRequest;
}

describe("GET /api/analytics/sales", () => {
  beforeEach(() => {
    mocks.respond = (query) =>
      query.table === "books"
        ? { data: [{ id: BOOK, title: "책", price: 1000 }], error: null }
        : { data: [], error: null };
  });

  it("책 조회가 실패하면 500 — 0원으로 보이지 않는다", async () => {
    mocks.respond = (query) => (query.table === "books" ? FAIL : OK_EMPTY);

    const res = await sales.GET();

    expect(res.status).toBe(500);
  });

  it("구매 조회가 실패하면 500", async () => {
    mocks.respond = (query) =>
      query.table === "books"
        ? { data: [{ id: BOOK, title: "책", price: 1000 }], error: null }
        : FAIL;

    const res = await sales.GET();

    expect(res.status).toBe(500);
  });

  it("구매가 1000건을 넘어도 다 센다", async () => {
    mocks.respond = (query) =>
      query.table === "books"
        ? { data: [{ id: BOOK, title: "책", price: 1000 }], error: null }
        : paged(query, 1500, () => ({ book_id: BOOK, price_paid: 1000 }));

    const json = await (await sales.GET()).json();

    expect(json.data.totalSales).toBe(1500);
    expect(json.data.totalRevenue).toBe(1_500_000);
    expect(json.data.bookStats[0]).toMatchObject({ sales: 1500 });
  });
});

describe("GET /api/analytics/workbook", () => {
  function respondWith(overrides: Partial<Record<string, (q: RecordedQuery) => QueryResult>>) {
    const defaults: Record<string, (q: RecordedQuery) => QueryResult> = {
      books: () => ({ data: { id: BOOK, owner_id: USER }, error: null }),
      chapters: () => ({ data: [{ id: "ch-1", title: "1장", order_index: 0 }], error: null }),
      workbook_blocks: () => ({ data: [], error: null }),
      "rpc:workbook_response_stats": () => ({ data: [], error: null }),
    };
    mocks.respond = (query) => ({ ...defaults, ...overrides })[query.table]?.(query) ?? OK_EMPTY;
  }

  beforeEach(() => respondWith({}));

  it("소유 확인 조회가 실패하면 404가 아니라 500", async () => {
    respondWith({ books: () => FAIL });

    const res = await workbook.GET(workbookRequest());

    expect(res.status).toBe(500);
  });

  it.each(["chapters", "workbook_blocks", "rpc:workbook_response_stats"])(
    "%s 조회가 실패하면 500 — '아무도 답하지 않음'으로 보이지 않는다",
    async (table) => {
      respondWith({ [table]: () => FAIL });

      const res = await workbook.GET(workbookRequest());

      expect(res.status).toBe(500);
    },
  );

  it("블록과 집계 행을 1000건 넘게 끝까지 읽는다", async () => {
    const blockId = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    respondWith({
      workbook_blocks: (q) =>
        paged(q, 1200, (i) => ({
          id: blockId(i),
          chapter_id: "ch-1",
          block_type: "reflection",
          order_index: i,
          workbook_block_fields: [{ field_key: "answer", label: "질문", order_index: 0 }],
        })),
      "rpc:workbook_response_stats": (q) =>
        paged(q, 1200, (i) => ({
          chapter_id: "ch-1",
          block_id: blockId(i),
          field_key: "answer",
          respondent_count: 1,
          answered_count: 1,
        })),
    });

    const res = await workbook.GET(workbookRequest());
    const blocks = (await res.json()).data.chapters[0].blocks;

    expect(res.status).toBe(200);
    expect(blocks).toHaveLength(1200);
    // 마지막 블록의 집계도 들어와서 0(거짓 이탈)으로 나오지 않는다.
    expect(blocks.at(-1)).toMatchObject({ block_id: blockId(1199), answered_readers: 1 });
  });
});
