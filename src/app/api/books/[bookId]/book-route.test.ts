// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  OK_EMPTY,
  type QueryResult,
  type RecordedQuery,
} from "@/test/fake-supabase";

/**
 * 판매된 책의 삭제와 공개 범위 (코드 리뷰 4-P0-5, 4-P1-19, 1-P1 `unlisted`).
 *
 * 판매 여부를 막는 것은 FK(RESTRICT, 마이그레이션 00006)입니다 — 그건
 * `rls.test.ts`가 실제 DB로 봅니다. 여기서 보는 것은 라우트가 그 거절을
 * 저자가 읽을 수 있는 안내로 바꾸는지, 본문을 먼저 지우지 않는지입니다.
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

const { DELETE, PUT } = await import("./route");

const params = { params: Promise.resolve({ bookId: BOOK }) };

function request(method: string, body?: unknown): NextRequest {
  return new Request(`http://localhost/api/books/${BOOK}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** 소유자 확인용 조회는 통과시키고, 그 밖의 쿼리는 `rest`가 정합니다. */
function respondWith(
  rest: (query: RecordedQuery) => QueryResult,
  book: Record<string, unknown> = {},
) {
  mocks.respond = (query) => {
    if (query.table === "books" && query.ops.includes("single") && !query.ops.includes("update")) {
      return {
        data: { owner_id: USER, status: "published", visibility: "public", published_at: null, language: "ko", ...book },
        error: null,
      };
    }
    return rest(query);
  };
}

function deletes() {
  return mocks.queries.filter((q) => q.ops.includes("delete"));
}

beforeEach(() => {
  // 입력 검증에서 돌아가면 클라이언트를 만들지 않아, 이전 테스트의 기록이
  // 남습니다.
  mocks.queries = [];
  respondWith(() => OK_EMPTY);
});

describe("DELETE /api/books/[bookId]", () => {
  it("판매 기록이 있으면(FK 23503) 409 HAS_SALES와 비공개 전환 안내", async () => {
    respondWith((query) =>
      query.ops.includes("delete")
        ? {
            data: null,
            error: {
              code: "23503",
              message: 'update or delete on table "books" violates foreign key constraint',
            },
          }
        : OK_EMPTY,
    );

    const res = await DELETE(request("DELETE"), params);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("HAS_SALES");
    expect(json.error).toContain("비공개");
    // DB 원문을 저자에게 보여 주지 않습니다.
    expect(json.error).not.toContain("foreign key");
  });

  it("챕터를 따로 먼저 지우지 않는다 — 책 삭제가 실패하면 본문이 남아야 한다", async () => {
    respondWith((query) =>
      query.ops.includes("delete")
        ? { data: null, error: { code: "23503", message: "fk" } }
        : OK_EMPTY,
    );

    await DELETE(request("DELETE"), params);

    expect(deletes().map((q) => q.table)).toEqual(["books"]);
  });

  it("판매되지 않은 책은 지운다", async () => {
    const res = await DELETE(request("DELETE"), params);

    expect(res.status).toBe(200);
    expect(deletes().map((q) => q.table)).toEqual(["books"]);
  });

  it("다른 실패는 500이고 DB 원문을 싣지 않는다", async () => {
    respondWith((query) =>
      query.ops.includes("delete")
        ? { data: null, error: { code: "08006", message: "connection failure" } }
        : OK_EMPTY,
    );

    const res = await DELETE(request("DELETE"), params);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).not.toContain("connection");
  });
});

describe("PUT /api/books/[bookId] — 링크 공유(unlisted)", () => {
  function updates() {
    return mocks.queries.filter((q) => q.ops.includes("update"));
  }

  it("새로 고르면 400이고 저장하지 않는다", async () => {
    const res = await PUT(request("PUT", { visibility: "unlisted" }), params);

    expect(res.status).toBe(400);
    expect(updates()).toHaveLength(0);
  });

  it("이미 unlisted인 책은 같은 값을 실어 보내도 다른 필드를 저장한다", async () => {
    // 설정 폼은 제목만 고쳐도 현재 visibility를 함께 보냅니다.
    respondWith(() => ({ data: { id: BOOK }, error: null }), { visibility: "unlisted" });

    const res = await PUT(
      request("PUT", { title: "고친 제목", visibility: "unlisted" }),
      params,
    );

    expect(res.status).toBe(200);
    expect(updates()[0].args.update).toMatchObject({ title: "고친 제목" });
  });

  it("구매자가 있어도 비공개 전환은 막지 않는다 — 산 독자는 계속 읽는다", async () => {
    respondWith(() => ({ data: { id: BOOK }, error: null }));

    const res = await PUT(request("PUT", { visibility: "private" }), params);

    expect(res.status).toBe(200);
    expect(updates()[0].args.update).toEqual({ visibility: "private" });
  });
});

describe("PUT /api/books/[bookId] — 입력 검증 (4-P1-17, 4-P1-18)", () => {
  function updates() {
    return mocks.queries.filter((q) => q.ops.includes("update"));
  }

  function rawRequest(body: string): NextRequest {
    return new Request(`http://localhost/api/books/${BOOK}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    }) as unknown as NextRequest;
  }

  it.each([
    ["본문이 JSON null", "null"],
    ["제목이 null", JSON.stringify({ title: null })],
    ["제목이 빈 문자열 — 공개된 책이 제목 없이 나간다", JSON.stringify({ title: "" })],
    ["대문자 상태", JSON.stringify({ status: "PUBLISHED" })],
    ["처리 중 상태는 서버 몫", JSON.stringify({ status: "processing" })],
    ["모르는 공개 범위", JSON.stringify({ visibility: "everyone" })],
    ["설명이 숫자", JSON.stringify({ description: 1 })],
    ["목록 밖의 새 언어", JSON.stringify({ language: "xx" })],
  ])("%s → 400, 저장하지 않는다", async (_label, body) => {
    const res = await PUT(rawRequest(body), params);

    expect(res.status).toBe(400);
    expect(updates()).toHaveLength(0);
  });

  it("표지 URL은 받지 않는다 — /cover 업로드로만 바꾼다", async () => {
    const res = await PUT(
      request("PUT", { cover_image_url: "https://tracker.example/pixel.png" }),
      params,
    );

    expect(res.status).toBe(400);
    expect(updates()).toHaveLength(0);
  });

  it("목록 밖 언어라도 지금 값 그대로면 다른 필드를 저장한다", async () => {
    // 업로드는 언어를 자유롭게 받았고, 설정 폼은 현재 언어를 함께 보냅니다.
    respondWith(() => ({ data: { id: BOOK }, error: null }), { language: "fr" });

    const res = await PUT(request("PUT", { title: "새 제목", language: "fr" }), params);

    expect(res.status).toBe(200);
    expect(updates()[0].args.update).toEqual({ title: "새 제목", language: "fr" });
  });

  it("제목은 앞뒤 공백을 걷고, 빈 설명은 null로", async () => {
    respondWith(() => ({ data: { id: BOOK }, error: null }));

    await PUT(request("PUT", { title: "  제목 ", description: "  " }), params);

    expect(updates()[0].args.update).toEqual({ title: "제목", description: null });
  });

  it("DB 에러 원문을 싣지 않는다", async () => {
    respondWith((query) =>
      query.ops.includes("update")
        ? { data: null, error: { message: "new row violates check constraint" } }
        : OK_EMPTY,
    );

    const res = await PUT(request("PUT", { title: "제목" }), params);

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/violates/);
  });
});
