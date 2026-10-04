// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OK_EMPTY, type QueryResult, type RecordedQuery } from "@/test/fake-supabase";

/**
 * 내가 쓴 워크북 목록 (코드 리뷰 7-P1-5, 7-P1-6, 7-P2-4).
 *
 * - 조회 실패를 빈 목록으로 내면 "쓴 워크북 없음"이 뜨고 재시도가 안 됩니다.
 * - 답이 1000건을 넘어도 끝까지 읽습니다.
 * - "최근에 쓴 순"은 독자가 쓴 시각(`written_at`)입니다.
 */

const USER = "user-1";
const BLOCK = "11111111-1111-4111-8111-111111111111";

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

const FAIL: QueryResult = { data: null, error: { message: "timeout" } };

function response(bookId: string, overrides: Record<string, unknown> = {}) {
  return {
    book_id: bookId,
    block_id: BLOCK,
    field_key: "answer",
    value_text: "답",
    value_number: null,
    value_bool: null,
    updated_at: "2026-10-01T00:00:00Z",
    written_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function book(id: string) {
  return { id, title: id, cover_image_url: null, owner_id: "author-1" };
}

function respondWith(overrides: Partial<Record<string, (q: RecordedQuery) => QueryResult>>) {
  const defaults: Record<string, (q: RecordedQuery) => QueryResult> = {
    workbook_responses: () => ({ data: [response("b-1")], error: null }),
    books: () => ({ data: [book("b-1")], error: null }),
    workbook_blocks: () => ({
      data: [{ id: BLOCK, book_id: "b-1", workbook_block_fields: [{ field_key: "answer" }] }],
      error: null,
    }),
    user_profiles: () => ({ data: [{ user_id: "author-1", display_name: "저자" }], error: null }),
  };
  mocks.respond = (query) => ({ ...defaults, ...overrides })[query.table]?.(query) ?? OK_EMPTY;
}

beforeEach(() => respondWith({}));

describe("GET /api/my/workbooks", () => {
  it.each(["workbook_responses", "books", "workbook_blocks"])(
    "%s 조회가 실패하면 500 — 빈 목록으로 보이지 않는다",
    async (table) => {
      respondWith({ [table]: () => FAIL });

      const res = await GET();

      expect(res.status).toBe(500);
    },
  );

  it("저자 이름 조회가 실패해도 목록은 그린다", async () => {
    respondWith({ user_profiles: () => FAIL });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data[0]).toMatchObject({ book_id: "b-1", author_name: null });
  });

  it("답이 1000건을 넘어도 끝까지 읽어 책이 빠지지 않는다", async () => {
    respondWith({
      // 앞 1000건은 b-1, 그 뒤 한 건만 b-2.
      workbook_responses: (q) => {
        const [from] = q.argLists.range as [number, number];
        if (from === 0) {
          return { data: Array.from({ length: 1000 }, () => response("b-1")), error: null };
        }
        return { data: [response("b-2")], error: null };
      },
      books: () => ({ data: [book("b-1"), book("b-2")], error: null }),
    });

    const json = await (await GET()).json();

    expect(json.data.map((row: { book_id: string }) => row.book_id).sort()).toEqual([
      "b-1",
      "b-2",
    ]);
  });

  it("최근에 쓴 순은 written_at — repoint로 오른 updated_at에 끌려가지 않는다", async () => {
    respondWith({
      workbook_responses: () => ({
        data: [
          // 오래전에 썼지만 저자가 장을 지워 updated_at만 최근인 답.
          response("old", {
            written_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-10-03T00:00:00Z",
          }),
          response("recent", {
            written_at: "2026-10-02T00:00:00Z",
            updated_at: "2026-10-02T00:00:00Z",
          }),
          // 00008 이전 행은 written_at이 비어 updated_at으로 대신한다.
          response("legacy", { written_at: null, updated_at: "2026-05-01T00:00:00Z" }),
        ],
        error: null,
      }),
      books: () => ({ data: [book("old"), book("recent"), book("legacy")], error: null }),
    });

    const json = await (await GET()).json();

    expect(json.data.map((row: { book_id: string }) => row.book_id)).toEqual([
      "recent",
      "legacy",
      "old",
    ]);
    expect(json.data[2].last_written_at).toBe("2026-01-01T00:00:00Z");
  });
});
