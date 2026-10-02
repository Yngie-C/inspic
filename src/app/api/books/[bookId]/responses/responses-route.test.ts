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
  chapterStatus: "published",
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

const { GET, PUT } = await import("./route");

function save(
  answers: unknown[] = [{ block_id: BLOCK, field_key: "answer", value: "다 썼어요" }],
  bookId = BOOK,
) {
  const request = new Request(`http://localhost/api/books/${bookId}/responses`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  }) as unknown as NextRequest;
  return PUT(request, { params: Promise.resolve({ bookId }) });
}

function load(bookId = BOOK) {
  const request = new Request(
    `http://localhost/api/books/${bookId}/responses`,
  ) as unknown as NextRequest;
  return GET(request, { params: Promise.resolve({ bookId }) });
}

function fields(result: QueryResult, block: Record<string, unknown> = {}) {
  mocks.respond = (query) => {
    if (query.table === "workbook_blocks") {
      return {
        data: [
          {
            id: BLOCK,
            book_id: BOOK,
            chapter_id: CHAPTER,
            block_type: "reflection",
            config: {},
            chapters: { status: mocks.chapterStatus },
            ...block,
          },
        ],
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
  mocks.chapterStatus = "published";
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

  it("책 ID가 UUID가 아니면 400 — 권한 안내(403)나 DB 원문(500)이 아니다", async () => {
    const res = await save(undefined, "not-a-uuid");

    expect(res.status).toBe(400);
    expect(mocks.queries).toEqual([]);
  });

  it("잘못된 항목이 섞여도 멀쩡한 답은 저장하고 나머지는 rejected로 돌려준다", async () => {
    const res = await save([
      { block_id: "", field_key: "answer", value: "ID 없는 블록" },
      { block_id: BLOCK, field_key: "answer", value: "멀쩡한 답" },
    ]);

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      saved: 1,
      rejected: [{ block_id: "", field_key: "answer", reason: "invalid_key" }],
    });
    expect(upserts()).toHaveLength(1);
  });

  it("공개 전 장의 블록에는 독자 답을 받지 않는다", async () => {
    mocks.chapterStatus = "draft";

    const res = await save();

    expect((await res.json()).data).toEqual({
      saved: 0,
      rejected: [{ block_id: BLOCK, field_key: "answer", reason: "unknown_field" }],
    });
    expect(upserts()).toEqual([]);
  });

  it("소유자는 공개 전 장의 블록에도 쓴다 — 미리보기에서 확인하는 경로", async () => {
    mocks.chapterStatus = "draft";
    mocks.access = { hasAccess: true, reason: "owner" };

    const res = await save();

    expect((await res.json()).data).toEqual({ saved: 1, rejected: [] });
  });

  it("척도 답은 블록 config의 범위로 검사한다", async () => {
    fields(
      { data: [{ block_id: BLOCK, field_key: "value", input_type: "integer" }], error: null },
      { block_type: "scale", config: { min: 1, max: 5 } },
    );

    const res = await save([
      { block_id: BLOCK, field_key: "value", value: 9 },
    ]);

    expect((await res.json()).data).toMatchObject({
      saved: 0,
      rejected: [{ reason: "type_mismatch" }],
    });
  });
});

describe("GET /api/books/[bookId]/responses", () => {
  function row(index: number) {
    return {
      block_id: BLOCK,
      field_key: `k${index}`,
      value_text: null,
      value_number: null,
      value_bool: true,
      updated_at: "2026-10-01T00:00:00Z",
    };
  }

  it("1000행을 넘으면 다음 페이지까지 읽는다", async () => {
    // 범위 없이 읽으면 PostgREST max_rows(1000)에서 조용히 잘려, 새 기기에서
    // 뒤쪽 답이 비어 보였습니다(3-P1-3).
    const pages = [Array.from({ length: 1000 }, (_, i) => row(i)), [row(1000)]];
    mocks.respond = (query) =>
      query.table === "workbook_responses"
        ? { data: pages.shift() ?? [], error: null }
        : OK_EMPTY;

    const res = await load();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1001);
    expect(mocks.queries.filter((q) => q.table === "workbook_responses")).toHaveLength(2);
  });

  it("DB 에러 원문을 내보내지 않는다", async () => {
    mocks.respond = () => ({
      data: null,
      error: { message: 'relation "workbook_responses" does not exist' },
    });

    const res = await load();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("relation");
  });

  it("책 ID가 UUID가 아니면 400", async () => {
    const res = await load("not-a-uuid");
    expect(res.status).toBe(400);
  });
});
