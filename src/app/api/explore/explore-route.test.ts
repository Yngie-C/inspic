// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { QueryResult, RecordedQuery } from "@/test/fake-supabase";

/**
 * 탐색 목록 (코드 리뷰 7-P1-7, 7-P2-1, 7-P2-5~7).
 *
 * - 검색어는 `.or()` 문법으로 새지 않습니다.
 * - 숫자·UUID가 아닌 파라미터는 500이 아니라 기본값이나 400.
 * - 페이지 사이에서 책이 겹치거나 빠지지 않게 마지막 정렬은 `id`.
 */

const AUTHOR = "11111111-1111-4111-8111-111111111111";

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

const { GET } = await import("./route");

function get(query = "") {
  return GET(new Request(`http://localhost/api/explore${query}`) as unknown as NextRequest);
}

function booksQuery(): RecordedQuery {
  const query = mocks.queries.find((q) => q.table === "books");
  if (!query) throw new Error("books 조회가 없음");
  return query;
}

function orders(): unknown[][] {
  return (booksQuery().calls ?? []).filter((c) => c.method === "order").map((c) => c.args);
}

beforeEach(() => {
  mocks.queries = [];
  mocks.respond = (query) =>
    query.table === "books"
      ? { data: [{ id: "b-1", owner_id: AUTHOR }], error: null }
      : { data: [{ user_id: AUTHOR, display_name: "저자" }], error: null };
});

describe("GET /api/explore", () => {
  it.each(["?page=abc", "?per_page=", "?page=-3&per_page=0"])(
    "숫자가 아닌 쪽수 %s는 기본값으로 읽는다",
    async (query) => {
      const res = await get(query);

      expect(res.status).toBe(200);
      expect(booksQuery().argLists.range).toEqual([0, 23]);
    },
  );

  it("UUID가 아닌 author_id는 400 — DB 원문 500이 아니다", async () => {
    const res = await get("?author_id=not-a-uuid");

    expect(res.status).toBe(400);
    expect(mocks.queries).toHaveLength(0);
  });

  it("검색어는 따옴표로 감싸 .or()에 넣는다", async () => {
    await get(`?q=${encodeURIComponent("C++, Python")}`);

    expect(booksQuery().args.or).toBe(
      'title.ilike."%C++, Python%",description.ilike."%C++, Python%"',
    );
  });

  it("마지막 정렬은 id, newest는 출간일 없는 책을 맨 뒤로", async () => {
    await get();

    expect(orders()).toEqual([
      ["published_at", { ascending: false, nullsFirst: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("가격순도 동률을 id로 끊는다", async () => {
    await get("?sort=price_asc");

    expect(orders().at(-1)).toEqual(["id", { ascending: true }]);
  });

  it("조회 실패는 500, DB 원문을 내지 않는다", async () => {
    mocks.respond = () => ({ data: null, error: { message: 'relation "books" does not exist' } });

    const res = await get();

    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain("relation");
  });

  it("저자 이름 조회가 실패해도 목록은 그린다", async () => {
    mocks.respond = (query) =>
      query.table === "books"
        ? { data: [{ id: "b-1", owner_id: AUTHOR }], error: null }
        : { data: null, error: { message: "timeout" } };

    const res = await get();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.books[0]).toMatchObject({ id: "b-1", author_name: null });
  });
});
