import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 접근 제어는 유료 콘텐츠와 미발행 원고를 가리는 유일한 서버 판정입니다.
 * 여섯 갈래(소유자 / 무료공개 / 비공개 / 미발행 / 구매자 / 미리보기)와
 * 판정 실패를 전부 고정합니다. 순서는 SQL has_book_access와 같습니다
 * (마이그레이션 00006): 소유자 → 구매 → 공개 발행본.
 *
 * 세 값이 각각 다른 것을 정합니다.
 *   hasAccess         책 전체를 읽는가 (응답 저장의 전제)
 *   canRead           일부라도 읽을 것이 있는가 (미리보기 포함)
 *   canSaveResponses  답이 계정에 남는가 (로그인이 함께 필요)
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
let bookError: { message: string } | null = null;
let purchaseError: { message: string } | null = null;

/**
 * `checkBookAccess`가 쓰는 두 쿼리만 흉내 냅니다.
 *   books:     .select().eq("id").maybeSingle()
 *   purchases: .select().eq().eq().eq().maybeSingle()
 */
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () =>
          table === "books"
            ? { data: bookRow, error: bookError }
            : { data: purchaseRow, error: purchaseError },
      };
      return chain;
    },
  }),
}));

const { checkBookAccess } = await import("./access-control");

const PUBLISHED_PAID: BookRow = {
  owner_id: OWNER_ID,
  price: 9900,
  status: "published",
  visibility: "public",
};

beforeEach(() => {
  bookRow = null;
  purchaseRow = null;
  bookError = null;
  purchaseError = null;
});

describe("checkBookAccess", () => {
  it("없는 책은 아무것도 열지 않는다", async () => {
    expect(await checkBookAccess(READER_ID, BOOK_ID)).toEqual({
      hasAccess: false,
      reason: "none",
      canRead: false,
      canSaveResponses: false,
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
      canRead: true,
      canSaveResponses: true,
    });
  });

  it("무료 공개 발행본은 비로그인도 읽는다", async () => {
    bookRow = { ...PUBLISHED_PAID, price: 0 };

    expect(await checkBookAccess(null, BOOK_ID)).toEqual({
      hasAccess: true,
      reason: "free",
      canRead: true,
      // 답이 매달릴 계정이 없습니다. 리더는 여기서 "이 기기에만
      // 저장됨"을 띄웁니다 — 저장되는 척하면 안 됩니다.
      canSaveResponses: false,
    });
  });

  it("무료 책도 로그인해야 답이 저장된다", async () => {
    bookRow = { ...PUBLISHED_PAID, price: 0 };

    const access = await checkBookAccess(READER_ID, BOOK_ID);

    expect(access.reason).toBe("free");
    expect(access.canSaveResponses).toBe(true);
  });

  it("비공개 책은 소유자가 아니면 미리보기도 없다", async () => {
    bookRow = { ...PUBLISHED_PAID, visibility: "private" };

    expect(await checkBookAccess(READER_ID, BOOK_ID)).toMatchObject({
      hasAccess: false,
      reason: "none",
      canRead: false,
    });
  });

  it("미발행 책은 소유자가 아니면 미리보기도 없다", async () => {
    bookRow = { ...PUBLISHED_PAID, status: "draft" };

    expect(await checkBookAccess(READER_ID, BOOK_ID)).toMatchObject({
      hasAccess: false,
      reason: "none",
      canRead: false,
    });
  });

  it("구매자는 유료 책 전체를 읽고 답도 저장된다", async () => {
    bookRow = PUBLISHED_PAID;
    purchaseRow = { id: "purchase-1" };

    expect(await checkBookAccess(READER_ID, BOOK_ID)).toEqual({
      hasAccess: true,
      reason: "purchased",
      canRead: true,
      canSaveResponses: true,
    });
  });

  it("비구매자는 미리보기만 — 전체 접근은 열리지 않는다", async () => {
    bookRow = PUBLISHED_PAID;
    purchaseRow = null;

    expect(await checkBookAccess(READER_ID, BOOK_ID)).toEqual({
      hasAccess: false,
      reason: "preview",
      canRead: true,
      // 미리보기에서 쓴 답은 서버로 가지 않습니다. 여기가 true가 되면
      // 구매하지 않은 책에 응답이 쌓입니다.
      canSaveResponses: false,
    });
  });

  it("비로그인도 유료 책 미리보기는 본다", async () => {
    bookRow = PUBLISHED_PAID;

    expect(await checkBookAccess(null, BOOK_ID)).toEqual({
      hasAccess: false,
      reason: "preview",
      canRead: true,
      canSaveResponses: false,
    });
  });
  it.each([
    ["비공개로 내린 책", { visibility: "private" }],
    ["보관한 책", { status: "archived" }],
    ["초안으로 되돌린 책", { status: "draft" }],
    ["링크 공유로 바꾼 책", { visibility: "unlisted" }],
  ])("구매자는 저자가 %s도 계속 읽고 답을 저장한다", async (_label, change) => {
    bookRow = { ...PUBLISHED_PAID, ...change };
    purchaseRow = { id: "purchase-1" };

    expect(await checkBookAccess(READER_ID, BOOK_ID)).toEqual({
      hasAccess: true,
      reason: "purchased",
      canRead: true,
      canSaveResponses: true,
    });
  });

  it("무료 책을 비공개로 내리면 산 적 없는 독자는 잃는다 — 열어 두는 것은 구매뿐이다", async () => {
    bookRow = { ...PUBLISHED_PAID, price: 0, visibility: "private" };

    expect(await checkBookAccess(READER_ID, BOOK_ID)).toMatchObject({
      hasAccess: false,
      reason: "none",
    });
  });

  it("책 조회가 실패하면 unavailable — '권한 없음'과 구분한다", async () => {
    bookError = { message: "connection reset" };

    expect(await checkBookAccess(READER_ID, BOOK_ID)).toEqual({
      hasAccess: false,
      reason: "unavailable",
      canRead: false,
      canSaveResponses: false,
    });
  });

  it("구매 조회가 실패하면 unavailable — 산 독자를 미리보기로 떨어뜨리지 않는다", async () => {
    bookRow = PUBLISHED_PAID;
    purchaseError = { message: "timeout" };

    expect(await checkBookAccess(READER_ID, BOOK_ID)).toMatchObject({
      hasAccess: false,
      reason: "unavailable",
      canRead: false,
    });
  });
});
