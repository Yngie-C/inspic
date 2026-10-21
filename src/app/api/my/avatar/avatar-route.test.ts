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
  avatarUrl: null as string | null,
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
    if (query.table === "user_profiles" && query.ops.includes("maybeSingle")) {
      return { data: { avatar_url: mocks.avatarUrl }, error: null };
    }
    return rest(query);
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
  mocks.avatarUrl = OLD_URL;
  respondWith();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/my/avatar", () => {
  it("본인 폴더에 올리기 → 프로필 갱신 → 옛 파일 지우기 순서", async () => {
    const res = await POST(upload());
    expect(res.status).toBe(200);

    const order = steps();
    expect(order[0]).toMatch(new RegExp(`^upload:"${USER}/\\d+\\.png"$`));
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
      query.table === "user_profiles" ? { data: null, error: { message: "db down" } } : OK_EMPTY,
    );

    const res = await POST(upload());
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain("db down");

    const uploaded = mocks.queries.find((q) => q.ops.includes("upload"))!.args.upload;
    const removes = mocks.queries.filter((q) => q.ops.includes("remove"));
    expect(removes.map((q) => q.args.remove)).toEqual([[uploaded]]);
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
    expect(steps()).toEqual(["update", `remove:${JSON.stringify([OLD_PATH])}`]);
  });

  it("비우기가 실패하면 파일을 지우지 않는다", async () => {
    respondWith((query) =>
      query.table === "user_profiles" ? { data: null, error: { message: "db down" } } : OK_EMPTY,
    );
    const res = await DELETE();
    expect(res.status).toBe(500);
    expect(steps().some((s) => s.startsWith("remove"))).toBe(false);
  });
});
