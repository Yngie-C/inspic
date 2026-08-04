import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 접근 제어는 유료 콘텐츠와 미발행 원고를 가리는 유일한 서버 판정입니다.
 * 다섯 갈래(소유자 / 무료공개 / 비공개 / 구매자 / 비구매자)를 전부 고정합니다.
 */

const BOOK_ID = "book-1";
const OWNER_ID = "owner-1";
const READER_ID = "reader-1";

interface BookRow {
  owner_id: string;
  price: number;
  status: string;
  visibility: string;
}

let bookRow: BookRow | null = null;
let purchaseRow: { id: string } | null = null;

/**
 * `checkBookAccess`가 쓰는 두 쿼리만 흉내 냅니다.
 *   books:     .select().eq("id").single()
 *   purchases: .select().eq().eq().eq().maybeSingle()
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () =>
          table === "books" ? { data: bookRow } : { data: null },
        maybeSingle: async () =>
          table === "purchases" ? { data: purchaseRow } : { data: null },
      };
      return chain;
    },
  }),
}));

const { checkBookAccess } = await import("./access-control");

beforeEach(() => {
  bookRow = null;
  purchaseRow = null;
});

describe("checkBookAccess", () => {
  it("없는 책은 거절한다", async () => {
    expect(await checkBookAccess(READER_ID, BOOK_ID)).toEqual({
      hasAccess: false,
      reason: "none",
    });
  });

  it("소유자는 미발행·비공개 상태에서도 통과한다", async () => {
    bookRow = {
      owner_id: OWNER_ID,
      price: 9900,
      status: "draft",
      visibility: "private",
    };

    expect(await checkBookAccess(OWNER_ID, BOOK_ID)).toEqual({
      hasAccess: true,
      reason: "owner",
    });
  });

  it("무료 공개 발행본은 비로그인도 통과한다", async () => {
    bookRow = {
      owner_id: OWNER_ID,
      price: 0,
      status: "published",
      visibility: "public",
    };

    expect(await checkBookAccess(null, BOOK_ID)).toEqual({
      hasAccess: true,
      reason: "free",
    });
  });

  it("비공개 책은 소유자가 아니면 거절한다", async () => {
    bookRow = {
      owner_id: OWNER_ID,
      price: 0,
      status: "published",
      visibility: "private",
    };

    expect(await checkBookAccess(READER_ID, BOOK_ID)).toEqual({
      hasAccess: false,
      reason: "none",
    });
  });

  it("미발행 책은 소유자가 아니면 거절한다", async () => {
    bookRow = {
      owner_id: OWNER_ID,
      price: 0,
      status: "draft",
      visibility: "public",
    };

    expect(await checkBookAccess(READER_ID, BOOK_ID)).toEqual({
      hasAccess: false,
      reason: "none",
    });
  });

  it("구매자는 유료 책을 통과한다", async () => {
    bookRow = {
      owner_id: OWNER_ID,
      price: 9900,
      status: "published",
      visibility: "public",
    };
    purchaseRow = { id: "purchase-1" };

    expect(await checkBookAccess(READER_ID, BOOK_ID)).toEqual({
      hasAccess: true,
      reason: "purchased",
    });
  });

  it("비구매자는 유료 책에서 거절한다", async () => {
    bookRow = {
      owner_id: OWNER_ID,
      price: 9900,
      status: "published",
      visibility: "public",
    };
    purchaseRow = null;

    expect(await checkBookAccess(READER_ID, BOOK_ID)).toEqual({
      hasAccess: false,
      reason: "none",
    });
  });

  it("비로그인은 유료 책에서 거절한다", async () => {
    bookRow = {
      owner_id: OWNER_ID,
      price: 9900,
      status: "published",
      visibility: "public",
    };

    expect(await checkBookAccess(null, BOOK_ID)).toEqual({
      hasAccess: false,
      reason: "none",
    });
  });
});
