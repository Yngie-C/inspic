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
 * 챕터 본문이 DB 길이 제약을 넘을 때 (코드 리뷰 4-P0-4).
 *
 * DB까지 가면 Postgres 원문이 담긴 500이 나오고 에디터는 원인을 모릅니다.
 * 라우트가 먼저 거절해 한국어 사유와 `CONTENT_TOO_LONG`을 돌려줘야
 * 에디터가 "저장 안 됨"과 해결 방법을 띄울 수 있습니다.
 */

const USER = "user-1";
const BOOK = "book-1";
const CHAPTER = "chapter-1";

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

vi.mock("@/lib/workbook/sync-blocks", () => ({
  syncChapterWorkbookBlocks: vi.fn(async () => ({ ok: true })),
}));

const { POST } = await import("./route");
const { PUT } = await import("./[chapterId]/route");

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

beforeEach(() => {
  mocks.respond = (query) => {
    if (query.table === "chapters" && query.ops.includes("single")) {
      return {
        data: {
          id: CHAPTER,
          book_id: BOOK,
          word_count: 0,
          published_at: null,
          books: { owner_id: USER, total_words: 0 },
        },
        error: null,
      };
    }
    if (query.table === "books" && query.ops.includes("single")) {
      return {
        data: { owner_id: USER, total_chapters: 0, total_words: 0 },
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
