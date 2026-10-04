// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { QueryResult, RecordedQuery } from "@/test/fake-supabase";

/**
 * 책 만들기 (코드 리뷰 7-P2-10~13).
 *
 * PUT과 같은 규칙으로 읽습니다. 잘못된 값은 DB에 가기 전에 400이고,
 * 보낸 가격을 읽을 수 없다고 무료로 바꾸지 않습니다.
 */

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
  getAuthUser: async () => ({ id: "user-1" }),
}));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/books", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest,
  );
}

function inserted(): Record<string, unknown> {
  return mocks.queries.find((q) => q.table === "books")?.args.insert as Record<string, unknown>;
}

const VALID = { title: "책", source_type: "text" };

beforeEach(() => {
  mocks.queries = [];
  mocks.respond = () => ({ data: { id: "book-1" }, error: null });
});

describe("POST /api/books", () => {
  it.each([
    ["JSON null", null],
    ["배열", []],
    ["빈 제목", { ...VALID, title: "   " }],
    ["모르는 source_type", { ...VALID, source_type: "pdf" }],
    ["문자열 가격", { ...VALID, price: "9900" }],
    ["소수 가격", { ...VALID, price: 9900.5 }],
    ["INTEGER를 넘는 가격", { ...VALID, price: 1e12 }],
    ["음수 가격", { ...VALID, price: -100 }],
    ["목록 밖 언어", { ...VALID, language: "xx" }],
    ["숫자 소개글", { ...VALID, description: 3 }],
  ])("%s는 DB에 가기 전에 400", async (_name, body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(mocks.queries).toHaveLength(0);
  });

  it("보내지 않은 값은 기본값 — 무료·한국어·소개글 없음", async () => {
    const res = await post(VALID);

    expect(res.status).toBe(201);
    expect(inserted()).toMatchObject({
      title: "책",
      price: 0,
      language: "ko",
      description: null,
      status: "draft",
      visibility: "private",
    });
  });

  it("제목·소개글의 앞뒤 공백을 걷고, 공백뿐인 소개글은 null", async () => {
    await post({ ...VALID, title: "  책  ", description: "   ", price: 9900, language: "en" });

    expect(inserted()).toMatchObject({ title: "책", description: null, price: 9900, language: "en" });
  });

  it("DB 오류는 원문 없이 500", async () => {
    mocks.respond = () => ({ data: null, error: { message: 'new row violates check constraint "x"' } });

    const res = await post(VALID);

    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain("constraint");
  });
});
