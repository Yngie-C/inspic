// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { OK_EMPTY, type QueryResult, type RecordedQuery } from "@/test/fake-supabase";

/**
 * 프로필 사진 교체·삭제 순서 (00014). 표지와 같은 규칙입니다 — 옛 파일은
 * 프로필 행을 바꾼 **뒤에** 지우고, 본인 폴더 밖의 파일은 건드리지 않습니다.
 */

const USER = "44444444-4444-4444-8444-444444444444";
const OLD_PATH = `${USER}/old.png`;
const OLD_URL = `https://project.supabase.co/storage/v1/object/public/avatars/${OLD_PATH}`;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

const mocks = vi.hoisted(() => ({
  respond: (() => ({ data: null, error: null })) as (query: RecordedQuery) => QueryResult,
  queries: [] as RecordedQuery[],
  client: null as unknown as { from: (table: string) => unknown },
  /** admin 클라이언트로 보낸 쿼리. URL 컬럼은 이쪽으로만 바뀝니다(00015). */
  adminQueries: new Set<RecordedQuery>(),
  avatarUrl: null as string | null,
}));

vi.mock("@/lib/supabase/server", async () => {
  const { createFakeSupabase } = await import("@/test/fake-supabase");
  return {
    createClient: async () => {
      const fake = createFakeSupabase((query) => mocks.respond(query));
      mocks.queries = fake.queries;
      mocks.client = fake.client;
      return fake.client;
    },
  };
});

// admin 쿼리도 같은 기록에 순서대로 남기고, admin으로 보냈다는 표시만 더합니다.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const builder = mocks.client.from(table);
      mocks.adminQueries.add(mocks.queries.at(-1)!);
      return builder;
    },
    get storage() {
      return (mocks.client as unknown as { storage: unknown }).storage;
    },
  }),
}));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  getAuthUser: async () => ({ id: USER }),
}));

const { POST, DELETE } = await import("./route");

function upload(bytes: Uint8Array = PNG): NextRequest {
  const form = new FormData();
  form.append("image", new Blob([bytes as BlobPart], { type: "image/png" }), "me.png");
  return new Request("http://localhost/api/my/avatar", {
    method: "POST",
    body: form,
  }) as unknown as NextRequest;
}

function respondWith(rest: (query: RecordedQuery) => QueryResult = () => OK_EMPTY) {
  mocks.respond = (query) => {
    const result = rest(query);
    if (result !== OK_EMPTY) return result;
    if (query.table === "user_profiles" && query.ops.includes("update")) {
      return { data: { user_id: USER }, error: null };
    }
    if (query.table === "user_profiles" && query.ops.includes("maybeSingle")) {
      return { data: { avatar_url: mocks.avatarUrl }, error: null };
    }
    return OK_EMPTY;
  };
}

const steps = () =>
  mocks.queries
    .filter((q) => q.table !== "user_profiles" || q.ops.includes("update"))
    .map((q) =>
      q.table === "user_profiles" ? "update" : `${q.ops[0]}:${JSON.stringify(q.args[q.ops[0]])}`,
    );

beforeEach(() => {
  mocks.queries = [];
  mocks.adminQueries = new Set();
  mocks.avatarUrl = OLD_URL;
  respondWith();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/my/avatar", () => {
  it("본인 폴더에 올리기 → 프로필 갱신 → 옛 파일 지우기 순서", async () => {
    const res = await POST(upload());
    expect(res.status).toBe(200);

    const order = steps();
    expect(order[0]).toMatch(new RegExp(`^upload:"${USER}/[0-9a-f-]{36}\\.png"$`));
    expect(order[1]).toBe("update");
    expect(order[2]).toBe(`remove:${JSON.stringify([OLD_PATH])}`);
  });

  it("예전에 직접 넣은 외부 URL은 지우지 않는다", async () => {
    mocks.avatarUrl = "https://example.com/me.png";
    await POST(upload());
    expect(steps().some((s) => s.startsWith("remove"))).toBe(false);
  });

  it("프로필 갱신이 실패하면 옛 파일은 두고 방금 올린 파일을 지운다", async () => {
    respondWith((query) =>
      query.table === "user_profiles" && query.ops.includes("update")
        ? { data: null, error: { message: "db down" } }
        : OK_EMPTY,
    );

    const res = await POST(upload());
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain("db down");

    const uploaded = mocks.queries.find((q) => q.ops.includes("upload"))!.args.upload;
    const removes = mocks.queries.filter((q) => q.ops.includes("remove"));
    expect(removes.map((q) => q.args.remove)).toEqual([[uploaded]]);
  });

  it("URL 컬럼 갱신만 admin 클라이언트로 보낸다 (00015)", async () => {
    await POST(upload());
    const updates = mocks.queries.filter((q) => q.table === "user_profiles" && q.ops.includes("update"));
    expect(updates).toHaveLength(1);
    expect(mocks.adminQueries.has(updates[0])).toBe(true);
    const reads = mocks.queries.filter((q) => q.table === "user_profiles" && !q.ops.includes("update"));
    expect(reads.some((q) => mocks.adminQueries.has(q))).toBe(false);
  });

  it("이미지가 아닌 파일은 415, 아무것도 올리지 않는다", async () => {
    const res = await POST(upload(new TextEncoder().encode("<html></html>")));
    expect(res.status).toBe(415);
    expect(mocks.queries.some((q) => q.ops.includes("upload"))).toBe(false);
  });
});

describe("DELETE /api/my/avatar", () => {
  it("프로필을 먼저 비우고 파일을 지운다", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    // 마지막은 본인 폴더의 옛 사진 정리(10-P1-10)입니다.
    expect(steps()).toEqual([
      "update",
      `remove:${JSON.stringify([OLD_PATH])}`,
      `list:${JSON.stringify(USER)}`,
    ]);
  });

  it("비우기가 실패하면 파일을 지우지 않는다", async () => {
    respondWith((query) =>
      query.table === "user_profiles" && query.ops.includes("update")
        ? { data: null, error: { message: "db down" } }
        : OK_EMPTY,
    );
    const res = await DELETE();
    expect(res.status).toBe(500);
    expect(steps().some((s) => s.startsWith("remove"))).toBe(false);
  });
});

describe("겹친 요청과 옛 사진 정리 (코드 리뷰 10-B)", () => {
  it("그 사이 사진이 바뀌었으면 409, 방금 올린 파일만 지운다", async () => {
    respondWith((query) =>
      query.table === "user_profiles" && query.ops.includes("update")
        ? { data: null, error: null }
        : OK_EMPTY,
    );
    // 다시 읽으면 다른 요청이 올린 사진을 가리킵니다.
    mocks.avatarUrl = `https://project.supabase.co/storage/v1/object/public/avatars/${USER}/other.png`;
    const res = await POST(upload());
    expect(res.status).toBe(409);
    const uploaded = mocks.queries.find((q) => q.ops.includes("upload"))!.args.upload;
    const removes = mocks.queries.filter((q) => q.ops.includes("remove"));
    expect(removes.map((q) => q.args.remove)).toEqual([[uploaded]]);
  });

  it("성공하면 본인 폴더에서 10분 넘은, 행이 가리키지 않는 사진을 지운다", async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const fresh = new Date().toISOString();
    respondWith((query) =>
      query.ops.includes("list")
        ? {
            data: [
              { id: "1", name: "orphan.png", created_at: old },
              { id: "2", name: "just-uploaded.png", created_at: fresh },
            ],
            error: null,
          }
        : OK_EMPTY,
    );
    const res = await DELETE();
    expect(res.status).toBe(200);
    const removes = mocks.queries.filter((q) => q.ops.includes("remove"));
    expect(removes.map((q) => q.args.remove)).toEqual([[OLD_PATH], [`${USER}/orphan.png`]]);
  });
});
