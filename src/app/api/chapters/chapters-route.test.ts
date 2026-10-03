// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  OK_EMPTY,
  type QueryResult,
  type RecordedQuery,
} from "@/test/fake-supabase";
import { MAX_CHAPTER_HTML_LENGTH } from "@/lib/content-stats";

/**
 * 챕터 API의 입력 검증과 저장 경로.
 *
 * - 본문이 DB 길이 제약을 넘을 때 (코드 리뷰 4-P0-4). DB까지 가면 Postgres
 *   원문이 담긴 500이 나오고 에디터는 원인을 모릅니다.
 * - 타입이 어긋난 입력 (4-P1-11). DB에 가기 전에 400으로 거절합니다.
 * - 새 장의 순서와 상태 (4-P1-9, 4-P1-14). 서버가 정합니다.
 * - 책 집계 (4-P1-10). 라우트는 `books`를 고치지 않습니다 — DB 트리거가
 *   셉니다(00009, `chapter-integrity.test.ts`).
 */

const USER = "user-1";
const BOOK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAPTER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

const sync = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("@/lib/workbook/sync-blocks", () => ({
  syncChapterWorkbookBlocks: sync,
}));

const { POST } = await import("./route");
const { PUT, DELETE } = await import("./[chapterId]/route");

const params = { params: Promise.resolve({ chapterId: CHAPTER }) };

function jsonRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/chapters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const tooLong = `<p>${"가".repeat(MAX_CHAPTER_HTML_LENGTH)}</p>`;

function writes() {
  return mocks.queries.filter((q) =>
    q.ops.some((op) => op === "insert" || op === "update"),
  );
}

function rawRequest(body: string): NextRequest {
  return new Request("http://localhost/api/chapters", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  }) as unknown as NextRequest;
}

/** 이번 요청에서 INSERT한 장 행. */
function insertedChapter(): Record<string, unknown> | undefined {
  const query = mocks.queries.find(
    (q) => q.table === "chapters" && q.ops.includes("insert"),
  );
  return query?.args.insert as Record<string, unknown> | undefined;
}

beforeEach(() => {
  sync.mockClear();
  // 입력 검증에서 돌아가면 클라이언트를 만들지 않아, 이전 테스트의 기록이
  // 남습니다.
  mocks.queries = [];
  mocks.respond = (query) => {
    if (query.table === "chapters" && query.ops.includes("single")) {
      return {
        data: {
          id: CHAPTER,
          book_id: BOOK,
          word_count: 0,
          published_at: null,
          books: { owner_id: USER },
        },
        error: null,
      };
    }
    if (query.table === "books" && query.ops.includes("single")) {
      return {
        data: { owner_id: USER, status: "draft" },
        error: null,
      };
    }
    return OK_EMPTY;
  };
});

describe("PUT /api/chapters/[chapterId]", () => {
  it("본문이 한도를 넘으면 DB에 쓰지 않고 400 CONTENT_TOO_LONG", async () => {
    const res = await PUT(jsonRequest({ title: "1장", content_html: tooLong }), {
      params: Promise.resolve({ chapterId: CHAPTER }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("CONTENT_TOO_LONG");
    expect(json.error).toMatch(/본문이 너무 길어/);
    expect(writes()).toEqual([]);
  });

  it("한도 안이면 저장한다", async () => {
    const base = mocks.respond;
    mocks.respond = (query) =>
      query.table === "chapters" && query.ops.includes("update")
        ? { data: { id: CHAPTER }, error: null }
        : base(query);

    const res = await PUT(jsonRequest({ title: "1장", content_html: "<p>짧은 글</p>" }), {
      params: Promise.resolve({ chapterId: CHAPTER }),
    });

    expect(res.status).toBe(200);
    expect(writes().some((q) => q.table === "chapters")).toBe(true);
  });
});

describe("POST /api/chapters", () => {
  it("본문이 한도를 넘으면 DB에 쓰지 않고 400 CONTENT_TOO_LONG", async () => {
    const res = await POST(
      jsonRequest({
        book_id: BOOK,
        title: "새 장",
        content_html: tooLong,
        order_index: 0,
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("CONTENT_TOO_LONG");
    expect(writes()).toEqual([]);
  });
});

describe("PUT /api/chapters/[chapterId] 입력 검증 (4-P1-11)", () => {
  it.each([
    ["본문이 JSON null", "null"],
    ["본문이 배열", "[]"],
    ["제목이 null", JSON.stringify({ title: null })],
    ["제목이 공백뿐", JSON.stringify({ title: "   " })],
    ["순서가 문자열", JSON.stringify({ order_index: "abc" })],
    ["순서가 음수", JSON.stringify({ order_index: -1 })],
    ["본문이 숫자", JSON.stringify({ content_html: 123 })],
    ["모르는 상태", JSON.stringify({ status: "PUBLISHED" })],
    ["content_raw가 객체", JSON.stringify({ content_raw: {} })],
  ])("%s → 400, DB에 쓰지 않는다", async (_label, body) => {
    const res = await PUT(rawRequest(body), params);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
    expect(writes()).toEqual([]);
  });

  it("장 ID가 UUID가 아니면 404이고 DB를 부르지 않는다", async () => {
    const res = await PUT(jsonRequest({ title: "1장" }), {
      params: Promise.resolve({ chapterId: "not-a-uuid" }),
    });

    expect(res.status).toBe(404);
    expect(mocks.queries).toEqual([]);
  });

  it("제목 앞뒤 공백을 걷어 저장한다", async () => {
    await PUT(jsonRequest({ title: "  1장  " }), params);

    const update = mocks.queries.find((q) => q.ops.includes("update"));
    expect(update?.args.update).toEqual({ title: "1장" });
  });

  it("책 집계를 직접 고치지 않는다 — DB 트리거가 센다", async () => {
    await PUT(jsonRequest({ content_html: "<p>새 본문</p>" }), params);

    expect(writes().some((q) => q.table === "books")).toBe(false);
  });

  it("방금 저장한 본문으로 동기화한다", async () => {
    await PUT(jsonRequest({ content_html: "<p>새 본문</p>" }), params);

    expect(sync).toHaveBeenCalledWith(expect.anything(), CHAPTER, "<p>새 본문</p>");
  });

  it("DB 에러 원문을 싣지 않는다", async () => {
    const base = mocks.respond;
    mocks.respond = (query) =>
      query.table === "chapters" && query.ops.includes("update")
        ? { data: null, error: { message: 'relation "chapters" violates check' } }
        : base(query);

    const res = await PUT(jsonRequest({ title: "1장" }), params);

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/relation|violates/);
  });
});

describe("POST /api/chapters 순서와 상태 (4-P1-9, 4-P1-14)", () => {
  function respondBook(status: string, lastOrder: number | null) {
    const base = mocks.respond;
    mocks.respond = (query) => {
      if (query.table === "books" && query.ops.includes("single")) {
        return { data: { owner_id: USER, status }, error: null };
      }
      if (query.table === "chapters" && query.ops.includes("maybeSingle")) {
        return {
          data: lastOrder === null ? null : { order_index: lastOrder },
          error: null,
        };
      }
      if (query.table === "chapters" && query.ops.includes("insert")) {
        return { data: { id: CHAPTER }, error: null };
      }
      return base(query);
    };
  }

  const newChapter = { book_id: BOOK, title: "새 장", content_html: "" };

  it("순서는 서버가 정한다 — 마지막 장 다음, 클라이언트 값은 무시", async () => {
    respondBook("draft", 4);

    const res = await POST(jsonRequest({ ...newChapter, order_index: 1 }));

    expect(res.status).toBe(201);
    expect(insertedChapter()?.order_index).toBe(5);
  });

  it("장이 없으면 0부터", async () => {
    respondBook("draft", null);

    await POST(jsonRequest(newChapter));

    expect(insertedChapter()?.order_index).toBe(0);
  });

  it("공개된 책에 더한 장은 draft — 독자 목차에 바로 뜨지 않는다", async () => {
    respondBook("published", 0);

    await POST(jsonRequest(newChapter));

    expect(insertedChapter()?.status).toBe("draft");
  });

  it("공개 전 책에 더한 장은 published — 처음 공개할 때 장마다 누르지 않게", async () => {
    respondBook("draft", 0);

    await POST(jsonRequest(newChapter));

    expect(insertedChapter()?.status).toBe("published");
  });

  it("상태를 보내면 그것을 따른다", async () => {
    respondBook("published", 0);

    await POST(jsonRequest({ ...newChapter, status: "published" }));

    expect(insertedChapter()?.status).toBe("published");
  });

  it("책 집계를 직접 고치지 않는다", async () => {
    respondBook("draft", 0);

    await POST(jsonRequest(newChapter));

    expect(writes().some((q) => q.table === "books")).toBe(false);
  });

  it.each([
    ["본문이 JSON null", null],
    ["book_id가 UUID가 아님", { ...newChapter, book_id: "book-1" }],
    ["제목이 공백뿐", { ...newChapter, title: "  " }],
    ["모르는 상태", { ...newChapter, status: "processing" }],
  ])("%s → 400, DB에 쓰지 않는다", async (_label, body) => {
    const res = await POST(jsonRequest(body));

    expect(res.status).toBe(400);
    expect(writes()).toEqual([]);
  });
});

describe("DELETE /api/chapters/[chapterId]", () => {
  it("책 집계를 직접 고치지 않는다 — DB 트리거가 장 수와 글자 수를 함께 뺀다", async () => {
    const res = await DELETE(jsonRequest(undefined), params);

    expect(res.status).toBe(200);
    expect(mocks.queries.some((q) => q.table === "books")).toBe(false);
  });
});
