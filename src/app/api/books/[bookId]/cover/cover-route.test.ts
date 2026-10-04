// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { OK_EMPTY, type QueryResult, type RecordedQuery } from "@/test/fake-supabase";

/**
 * 표지 교체·삭제 순서와 오류 안내 (코드 리뷰 5-P1-7, 5-P1-9).
 *
 * 옛 파일은 책 행을 바꾼 **뒤에** 지웁니다. 먼저 지우면 업로드·갱신이
 * 실패했을 때 책이 지워진 파일을 가리켜 표지가 깨집니다.
 */

const USER = "user-1";
const BOOK = "11111111-1111-4111-8111-111111111111";
const OLD_PATH = `covers/${BOOK}/old.png`;
const OLD_URL = `https://project.supabase.co/storage/v1/object/public/covers/${OLD_PATH}`;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

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

const { POST, DELETE } = await import("./route");

const params = { params: Promise.resolve({ bookId: BOOK }) };

function upload(bytes: Uint8Array = PNG): NextRequest {
  const form = new FormData();
  form.append("image", new Blob([bytes as BlobPart], { type: "image/png" }), "cover.png");
  return new Request(`http://localhost/api/books/${BOOK}/cover`, {
    method: "POST",
    body: form,
  }) as unknown as NextRequest;
}

const remove = () => new Request("http://localhost", { method: "DELETE" }) as unknown as NextRequest;

/** 책 조회는 옛 표지를 가진 내 책으로, 나머지는 `rest`가 정합니다. */
function respondWith(rest: (query: RecordedQuery) => QueryResult = () => OK_EMPTY) {
  mocks.respond = (query) => {
    if (query.table === "books" && query.ops.includes("maybeSingle")) {
      return { data: { owner_id: USER, cover_image_url: OLD_URL }, error: null };
    }
    return rest(query);
  };
}

const steps = () =>
  mocks.queries
    .filter((q) => q.table !== "books" || q.ops.includes("update"))
    .map((q) => (q.table === "books" ? "update" : `${q.ops[0]}:${JSON.stringify(q.args[q.ops[0]])}`));

beforeEach(() => {
  mocks.queries = [];
  respondWith();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/books/[bookId]/cover", () => {
  it("새 파일 올리기 → 책 갱신 → 옛 파일 지우기 순서", async () => {
    const res = await POST(upload(), params);
    expect(res.status).toBe(200);

    const order = steps();
    expect(order[0]).toMatch(/^upload:"covers\/.+\.png"$/);
    expect(order[1]).toBe("update");
    expect(order[2]).toBe(`remove:${JSON.stringify([OLD_PATH])}`);
  });

  it("업로드가 실패하면 옛 파일을 지우지 않고, 원문 없이 한국어로 안내", async () => {
    respondWith((query) =>
      query.ops.includes("upload")
        ? { data: null, error: { message: "new row violates row-level security policy" } }
        : OK_EMPTY,
    );

    const res = await POST(upload(), params);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("표지를 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    expect(json.error).not.toContain("row-level");
    expect(steps().some((s) => s.startsWith("remove"))).toBe(false);
  });

  it("책 갱신이 실패하면 옛 파일은 두고 방금 올린 파일을 지운다", async () => {
    respondWith((query) =>
      query.table === "books" ? { data: null, error: { message: "db down" } } : OK_EMPTY,
    );

    const res = await POST(upload(), params);
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain("db down");

    const uploaded = mocks.queries.find((q) => q.ops.includes("upload"))!.args.upload;
    const removes = mocks.queries.filter((q) => q.ops.includes("remove"));
    expect(removes.map((q) => q.args.remove)).toEqual([[uploaded]]);
  });

  it("이미지가 아닌 파일은 415, 아무것도 올리지 않는다", async () => {
    const res = await POST(upload(new TextEncoder().encode("<html></html>")), params);
    expect(res.status).toBe(415);
    expect((await res.json()).error).toContain("이미지만");
    expect(steps()).toEqual([]);
  });

  it("책 조회 오류는 404가 아니라 500", async () => {
    mocks.respond = () => ({ data: null, error: { message: "timeout" } });
    const res = await POST(upload(), params);
    expect(res.status).toBe(500);
  });

  it("UUID가 아닌 책 ID는 DB에 묻지 않고 404", async () => {
    const res = await POST(upload(), { params: Promise.resolve({ bookId: "nope" }) });
    expect(res.status).toBe(404);
    expect(mocks.queries).toEqual([]);
  });
});

describe("DELETE /api/books/[bookId]/cover", () => {
  it("책 행을 비운 뒤 파일을 지운다", async () => {
    const res = await DELETE(remove(), params);
    expect(res.status).toBe(200);
    expect(steps()).toEqual(["update", `remove:${JSON.stringify([OLD_PATH])}`]);
  });

  it("책 행을 비우지 못하면 파일을 지우지 않는다", async () => {
    respondWith((query) =>
      query.table === "books" ? { data: null, error: { message: "db down" } } : OK_EMPTY,
    );
    const res = await DELETE(remove(), params);
    expect(res.status).toBe(500);
    expect(steps()).toEqual(["update"]);
  });

  it("다른 책 폴더를 가리키는 표지 URL이면 파일은 건드리지 않는다", async () => {
    mocks.respond = (query) =>
      query.ops.includes("maybeSingle")
        ? {
            data: {
              owner_id: USER,
              cover_image_url:
                "https://project.supabase.co/storage/v1/object/public/covers/covers/other/1.png",
            },
            error: null,
          }
        : OK_EMPTY;
    const res = await DELETE(remove(), params);
    expect(res.status).toBe(200);
    expect(steps()).toEqual(["update"]);
  });
});
