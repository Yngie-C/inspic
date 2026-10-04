// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { OK_EMPTY, type QueryResult, type RecordedQuery } from "@/test/fake-supabase";

/**
 * 책 상세 (코드 리뷰 7-P1-8, 7-P1-9, 7-P2-1, 7-P2-3).
 *
 * - 없는 책(PGRST116)만 404. 장애를 404로 내면 산 책이 "삭제됨"으로 보입니다.
 * - 장 조회가 실패하면 500. 빈 목차는 "공개된 장 없음"으로 보입니다.
 * - 소유자가 아니면 목차는 `book_table_of_contents`(00011)에서 옵니다.
 *   chapters를 직접 읽으면 RLS가 사지 않은 독자에게 미리보기 장 하나만 줍니다.
 */

const mocks = vi.hoisted(() => ({
  respond: (() => ({ data: null, error: null })) as (query: RecordedQuery) => QueryResult,
  queries: [] as RecordedQuery[],
  userId: "reader-1",
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
  getAuthUser: async () => ({ id: mocks.userId }),
}));

const { GET } = await import("./route");

const BOOK_ROW = { id: "book-1", title: "책", owner_id: "author-1" };

function get() {
  return GET({} as NextRequest, { params: Promise.resolve({ bookId: "book-1" }) });
}

function respondWith(overrides: Partial<Record<string, QueryResult>>) {
  const defaults: Record<string, QueryResult> = {
    books: { data: BOOK_ROW, error: null },
    user_profiles: { data: { display_name: "저자" }, error: null },
    "rpc:book_table_of_contents": { data: [{ id: "ch-1", title: "1장" }], error: null },
    chapters: { data: [{ id: "ch-1", title: "1장" }, { id: "ch-d", title: "초안" }], error: null },
  };
  mocks.respond = (query) => ({ ...defaults, ...overrides })[query.table] ?? OK_EMPTY;
}

beforeEach(() => {
  mocks.userId = "reader-1";
  respondWith({});
});

describe("GET /api/books/[bookId]/detail", () => {
  it("행이 없으면(PGRST116) 404", async () => {
    respondWith({ books: { data: null, error: { message: "no rows", code: "PGRST116" } } });

    expect((await get()).status).toBe(404);
  });

  it("책 조회 장애는 404가 아니라 500", async () => {
    respondWith({ books: { data: null, error: { message: "timeout" } } });

    expect((await get()).status).toBe(500);
  });

  it("목차 조회가 실패하면 500 — 빈 목차로 보이지 않는다", async () => {
    respondWith({ "rpc:book_table_of_contents": { data: null, error: { message: "timeout" } } });

    expect((await get()).status).toBe(500);
  });

  it("독자의 목차는 목차 함수에서 — chapters를 직접 읽지 않는다", async () => {
    const json = await (await get()).json();

    expect(json.data.chapters).toHaveLength(1);
    expect(mocks.queries.find((q) => q.table === "rpc:book_table_of_contents")?.args.rpc).toEqual({
      p_book_id: "book-1",
    });
    expect(mocks.queries.some((q) => q.table === "chapters")).toBe(false);
  });

  it("소유자는 편집용으로 draft까지 chapters에서 읽는다", async () => {
    mocks.userId = "author-1";

    const json = await (await get()).json();

    expect(json.data.chapters).toHaveLength(2);
    expect(mocks.queries.some((q) => q.table === "rpc:book_table_of_contents")).toBe(false);
  });

  it("소유자의 장 조회가 실패해도 500", async () => {
    mocks.userId = "author-1";
    respondWith({ chapters: { data: null, error: { message: "timeout" } } });

    expect((await get()).status).toBe(500);
  });

  it("저자 이름 조회가 실패해도 상세는 그린다", async () => {
    respondWith({ user_profiles: { data: null, error: { message: "timeout" } } });

    const res = await get();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.book).toMatchObject({ title: "책", author_name: null });
    expect(json.data.chapters).toHaveLength(1);
  });
});
