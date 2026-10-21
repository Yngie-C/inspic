// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { QueryResult, RecordedQuery } from "@/test/fake-supabase";

/**
 * 저자 페이지 데이터. 조회 실패를 "없는 저자"나 "책 없음"으로 넘기지 않고,
 * 책은 공개된 것만 직접 거릅니다(구매자에게는 RLS가 산 비공개 책도 보여 줍니다).
 */

const USER = "44444444-4444-4444-8444-444444444444";

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

const get = (userId: string) =>
  GET(new Request(`http://localhost/api/authors/${userId}`) as unknown as NextRequest, {
    params: Promise.resolve({ userId }),
  });

const PROFILE = { user_id: USER, display_name: "김저자", bio: "마케터", about: "이력", avatar_url: null };

function respondWith(tables: Record<string, QueryResult>) {
  mocks.respond = (query) => tables[query.table] ?? { data: null, error: null };
}

beforeEach(() => {
  mocks.queries = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/authors/[userId]", () => {
  it("프로필과 공개한 책을 돌려준다", async () => {
    respondWith({
      user_profiles: { data: PROFILE, error: null },
      books: { data: [{ id: "b1", title: "책" }], error: null },
    });

    const res = await get(USER);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ profile: PROFILE, books: [{ id: "b1", title: "책" }] });

    const books = mocks.queries.find((q) => q.table === "books")!;
    const filters = books.calls!.filter((c) => c.method === "eq").map((c) => c.args);
    expect(filters).toEqual([
      ["owner_id", USER],
      ["status", "published"],
      ["visibility", "public"],
    ]);
  });

  it("UUID가 아니거나 프로필이 없으면 404", async () => {
    expect((await get("not-a-uuid")).status).toBe(404);
    expect(mocks.queries).toEqual([]);

    respondWith({ user_profiles: { data: null, error: null } });
    expect((await get(USER)).status).toBe(404);
  });

  it("프로필이나 책 조회가 실패하면 500", async () => {
    respondWith({ user_profiles: { data: null, error: { message: "timeout" } } });
    expect((await get(USER)).status).toBe(500);

    respondWith({
      user_profiles: { data: PROFILE, error: null },
      books: { data: null, error: { message: "timeout" } },
    });
    const res = await get(USER);
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain("timeout");
  });
});
