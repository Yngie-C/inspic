// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { OK_EMPTY, type QueryResult, type RecordedQuery } from "@/test/fake-supabase";

/** 본문 이미지 업로드의 오류 안내 (코드 리뷰 5-P1-9, 5-P2-7, 5-P2-8, 5-P2-10). */

const USER = "user-1";
const BOOK = "11111111-1111-4111-8111-111111111111";
const CHAPTER = "22222222-2222-4222-8222-222222222222";
const GIF = new TextEncoder().encode("GIF89a....");

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

const { POST } = await import("./route");

const params = { params: Promise.resolve({ bookId: BOOK }) };

function upload(bytes: Uint8Array = GIF, chapterId = CHAPTER): NextRequest {
  const form = new FormData();
  form.append("image", new Blob([bytes as BlobPart], { type: "image/png" }), "a.png");
  form.append("chapterId", chapterId);
  return new Request(`http://localhost/api/books/${BOOK}/images`, {
    method: "POST",
    body: form,
  }) as unknown as NextRequest;
}

function respondWith(
  overrides: { book?: QueryResult; chapter?: QueryResult; upload?: QueryResult } = {},
) {
  mocks.respond = (query) => {
    if (query.table === "books") return overrides.book ?? { data: { owner_id: USER }, error: null };
    if (query.table === "chapters") return overrides.chapter ?? { data: { id: CHAPTER }, error: null };
    if (query.ops.includes("upload")) return overrides.upload ?? OK_EMPTY;
    return OK_EMPTY;
  };
}

beforeEach(() => {
  mocks.queries = [];
  respondWith();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/books/[bookId]/images", () => {
  it("앞머리로 판정한 종류로 올린다 — 적힌 type이 png여도 GIF면 gif", async () => {
    const res = await POST(upload(), params);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.path).toMatch(new RegExp(`^${BOOK}/${CHAPTER}/.+\\.gif$`));

    const call = mocks.queries.find((q) => q.ops.includes("upload"))!;
    expect(call.argLists.upload[2]).toMatchObject({ contentType: "image/gif", upsert: false });
  });

  it("이미지가 아니면 한국어 415", async () => {
    const res = await POST(upload(new TextEncoder().encode("<svg onload=alert(1)>")), params);
    expect(res.status).toBe(415);
    expect((await res.json()).error).toBe("JPEG, PNG, WebP, GIF 이미지만 올릴 수 있어요.");
  });

  it("Storage 오류 원문을 화면에 싣지 않는다", async () => {
    respondWith({ upload: { data: null, error: { message: "The resource already exists" } } });
    const res = await POST(upload(), params);
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toBe("이미지를 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  });

  it("책·장 조회 오류는 500, 없으면 404", async () => {
    respondWith({ book: { data: null, error: { message: "timeout" } } });
    expect((await POST(upload(), params)).status).toBe(500);

    respondWith({ book: { data: null, error: null } });
    expect((await POST(upload(), params)).status).toBe(404);

    respondWith({ chapter: { data: null, error: { message: "timeout" } } });
    expect((await POST(upload(), params)).status).toBe(500);

    respondWith({ chapter: { data: null, error: null } });
    const res = await POST(upload(), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("이 책에서 장을 찾을 수 없어요.");
  });

  it("UUID가 아닌 장 ID는 DB에 묻지 않고 400", async () => {
    const res = await POST(upload(GIF, "temp-1"), params);
    expect(res.status).toBe(400);
    expect(mocks.queries.some((q) => q.table === "chapters")).toBe(false);
  });

  it("남의 책이면 403", async () => {
    respondWith({ book: { data: { owner_id: "someone" }, error: null } });
    expect((await POST(upload(), params)).status).toBe(403);
  });
});
