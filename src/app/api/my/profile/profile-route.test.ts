// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { QueryResult, RecordedQuery } from "@/test/fake-supabase";

/**
 * 프로필 저장 (00014). 길이·타입은 DB에 가기 전에 거절하고, 사진 URL은
 * 이 경로로 바꾸지 못합니다 — 업로드(`/api/my/avatar`)로만 바꿉니다.
 */

const USER = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  respond: (() => ({ data: null, error: null })) as (query: RecordedQuery) => QueryResult,
  queries: [] as RecordedQuery[],
  userId: "44444444-4444-4444-8444-444444444444" as string | null,
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
  getAuthUser: async () => (mocks.userId ? { id: mocks.userId } : null),
}));

const { PUT } = await import("./route");

function put(body: unknown): NextRequest {
  return new Request("http://localhost/api/my/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const updated = () => mocks.queries.find((q) => q.ops.includes("update"))?.args.update as
  | Record<string, unknown>
  | undefined;

beforeEach(() => {
  mocks.queries = [];
  mocks.userId = USER;
  mocks.respond = () => ({ data: { user_id: USER }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PUT /api/my/profile", () => {
  it("보낸 필드만 다듬어 본인 행에 쓴다 — 빈 글은 null, 한 줄 소개의 줄바꿈은 공백", async () => {
    const res = await PUT(put({ display_name: "  김저자 ", bio: "마케터\n10년차", about: "   " }));
    expect(res.status).toBe(200);

    expect(updated()).toMatchObject({ display_name: "김저자", bio: "마케터 10년차", about: null });
    const query = mocks.queries.find((q) => q.ops.includes("update"))!;
    expect(query.table).toBe("user_profiles");
    expect(query.argLists.eq).toEqual(["user_id", USER]);
  });

  it("avatar_url은 받지 않는다", async () => {
    const res = await PUT(put({ avatar_url: "https://evil.example/x.png" }));
    expect(res.status).toBe(400);
    expect(updated()).toBeUndefined();
  });

  it("상한을 넘거나 타입이 어긋나면 400, DB에 가지 않는다", async () => {
    for (const body of [
      { bio: "가".repeat(81) },
      { about: "가".repeat(2001) },
      { display_name: "가".repeat(41) },
      { about: 3 },
    ]) {
      const res = await PUT(put(body));
      expect(res.status).toBe(400);
    }
    expect(updated()).toBeUndefined();
  });

  it("본문이 객체가 아니면 400", async () => {
    expect((await PUT(put(null))).status).toBe(400);
    expect((await PUT(put(["x"]))).status).toBe(400);
  });

  it("비로그인은 401", async () => {
    mocks.userId = null;
    expect((await PUT(put({ bio: "x" }))).status).toBe(401);
  });

  it("저장이 실패하거나 행이 없으면 원문 없이 500", async () => {
    mocks.respond = () => ({ data: null, error: { message: "violates check constraint" } });
    const failed = await PUT(put({ bio: "x" }));
    expect(failed.status).toBe(500);
    expect((await failed.json()).error).not.toContain("constraint");

    mocks.respond = () => ({ data: null, error: null });
    expect((await PUT(put({ bio: "x" }))).status).toBe(500);
  });
});
