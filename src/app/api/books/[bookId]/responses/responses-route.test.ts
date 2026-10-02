// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { OK_EMPTY, type QueryResult, type RecordedQuery } from "@/test/fake-supabase";

/**
 * 문항 정의 조회가 실패할 때 (코드 리뷰 3-P0-2).
 *
 * 조회 에러를 정의 0개로 보면 모든 답이 `rejected`로 담긴 200이 됩니다.
 * 리더는 200을 "보냈다"로 보고 큐에서 지우므로 답이 다시 전송되지
 * 않습니다. 500이어야 큐에 남습니다.
 */

const USER = "33333333-3333-4333-8333-333333333333";
const BOOK = "44444444-4444-4444-8444-444444444444";
const CHAPTER = "55555555-5555-4555-8555-555555555555";
const BLOCK = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  access: { hasAccess: true, reason: "purchased" } as { hasAccess: boolean; reason: string },
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

vi.mock("@/lib/access-control", () => ({
  checkBookAccess: async () => mocks.access,
}));

const { PUT } = await import("./route");

function save() {
  const request = new Request(`http://localhost/api/books/${BOOK}/responses`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      answers: [{ block_id: BLOCK, field_key: "answer", value: "다 썼어요" }],
    }),
  }) as unknown as NextRequest;
  return PUT(request, { params: Promise.resolve({ bookId: BOOK }) });
}

function fields(result: QueryResult) {
  mocks.respond = (query) => {
    if (query.table === "workbook_blocks") {
      return {
        data: [{ id: BLOCK, book_id: BOOK, chapter_id: CHAPTER }],
        error: null,
      };
    }
    if (query.table === "workbook_block_fields") return result;
    return OK_EMPTY;
  };
}

function upserts() {
  return mocks.queries.filter((q) => q.ops.includes("upsert"));
}

beforeEach(() => {
  mocks.access = { hasAccess: true, reason: "purchased" };
  // 라우트가 클라이언트를 만들기 전에 끝나면 앞 테스트의 기록이 남습니다.
  mocks.queries = [];
  fields({
    data: [{ block_id: BLOCK, field_key: "answer", input_type: "longtext" }],
    error: null,
  });
});

describe("PUT /api/books/[bookId]/responses", () => {
  it("문항 정의 조회가 실패하면 500이고 아무것도 쓰지 않는다", async () => {
    fields({ data: null, error: { message: "connection reset" } });

    const res = await save();

    expect(res.status).toBe(500);
    expect(upserts()).toEqual([]);
  });

  it("블록 조회가 실패해도 500이다", async () => {
    mocks.respond = (query) =>
      query.table === "workbook_blocks"
        ? { data: null, error: { message: "connection reset" } }
        : OK_EMPTY;

    const res = await save();

    expect(res.status).toBe(500);
    expect(upserts()).toEqual([]);
  });

  it("조회가 성공하면 저장한다", async () => {
    const res = await save();

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ saved: 1, rejected: [] });
    expect(upserts()).toHaveLength(1);
  });

  it("접근 판정을 못 하면 403이 아니라 500 — 리더가 답을 큐에 남긴다", async () => {
    mocks.access = { hasAccess: false, reason: "unavailable" };

    const res = await save();

    expect(res.status).toBe(500);
    expect(upserts()).toEqual([]);
  });

  it("권한이 없으면 403", async () => {
    mocks.access = { hasAccess: false, reason: "preview" };

    const res = await save();

    expect(res.status).toBe(403);
  });
});
