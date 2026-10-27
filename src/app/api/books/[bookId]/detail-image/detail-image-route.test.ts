// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { OK_EMPTY, type QueryResult, type RecordedQuery } from "@/test/fake-supabase";

/**
 * 책 소개 이미지 (00013, 코드 리뷰 10-P1-7·P1-12). 표지와 같은 핸들러를 쓰되
 * `detail-` 앞머리·`detail_image_url` 컬럼이고, 바꾸거나 지우면 대체 글도 비웁니다.
 */

const USER = "user-1";
const BOOK = "11111111-1111-4111-8111-111111111111";
const OLD_PATH = `covers/${BOOK}/detail-old.png`;
const OLD_URL = `https://project.supabase.co/storage/v1/object/public/covers/${OLD_PATH}`;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

const mocks = vi.hoisted(() => ({
  respond: (() => ({ data: null, error: null })) as (query: RecordedQuery) => QueryResult,
  queries: [] as RecordedQuery[],
  client: null as unknown as { from: (table: string) => unknown; storage: unknown },
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

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => mocks.client.from(table),
    get storage() {
      return mocks.client.storage;
    },
  }),
}));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  getAuthUser: async () => ({ id: USER }),
}));

const { POST, DELETE } = await import("./route");

const params = { params: Promise.resolve({ bookId: BOOK }) };

function upload(): NextRequest {
  const form = new FormData();
  form.append("image", new Blob([PNG as BlobPart], { type: "image/png" }), "detail.png");
  return new Request(`http://localhost/api/books/${BOOK}/detail-image`, {
    method: "POST",
    body: form,
  }) as unknown as NextRequest;
}

const remove = () => new Request("http://localhost", { method: "DELETE" }) as unknown as NextRequest;

beforeEach(() => {
  mocks.queries = [];
  mocks.respond = (query) => {
    if (query.table === "books" && query.ops.includes("update")) {
      return { data: { id: BOOK }, error: null };
    }
    if (query.table === "books" && query.ops.includes("maybeSingle")) {
      return { data: { owner_id: USER, detail_image_url: OLD_URL }, error: null };
    }
    return OK_EMPTY;
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const update = () => mocks.queries.find((q) => q.table === "books" && q.ops.includes("update"))!;

describe("POST /api/books/[bookId]/detail-image", () => {
  it("detail- 앞머리로 올리고 detail_image_url을 바꾸며 대체 글을 비운다", async () => {
    const res = await POST(upload(), params);
    expect(res.status).toBe(200);

    const uploaded = mocks.queries.find((q) => q.ops.includes("upload"))!.args.upload as string;
    expect(uploaded).toMatch(new RegExp(`^covers/${BOOK}/detail-[0-9a-f-]{36}\\.png$`));
    expect(update().args.update).toEqual({
      detail_image_url: expect.stringContaining(uploaded),
      detail_image_alt: null,
    });
    // 옛 값이 그대로일 때만 바꿉니다 (10-P1-5).
    expect(update().calls).toContainEqual({ method: "eq", args: ["detail_image_url", OLD_URL] });

    const json = await res.json();
    expect(json.data).toEqual({
      detail_image_url: expect.stringContaining(uploaded),
      detail_image_alt: null,
    });
  });
});

describe("DELETE /api/books/[bookId]/detail-image", () => {
  it("URL과 대체 글을 함께 비운 뒤 파일을 지운다 (10-P1-7)", async () => {
    const res = await DELETE(remove(), params);
    expect(res.status).toBe(200);
    expect(update().args.update).toEqual({ detail_image_url: null, detail_image_alt: null });
    const removes = mocks.queries.filter((q) => q.ops.includes("remove"));
    expect(removes.map((q) => q.args.remove)).toEqual([[OLD_PATH]]);
  });

  it("바뀐 행이 없으면 파일을 지우지 않는다 (10-P1-8)", async () => {
    const base = mocks.respond;
    mocks.respond = (query) =>
      query.table === "books" && query.ops.includes("update") ? OK_EMPTY : base(query);
    const res = await DELETE(remove(), params);
    expect(res.status).toBe(409);
    expect(mocks.queries.some((q) => q.ops.includes("remove"))).toBe(false);
  });
});
