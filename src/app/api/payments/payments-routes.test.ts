// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { QueryResult, RecordedQuery } from "@/test/fake-supabase";
import type { TossPayment } from "@/lib/toss-payments";

/**
 * confirm·webhook 라우트가 Toss의 대답을 어떻게 다루는지
 * (코드 리뷰 1-P0-1, 1-P0-4, 1-P1 "결제 API·라우트").
 *
 * 지키는 것: Toss가 분명히 거절했을 때만 `aborted`로 남기고, 결과를
 * 모르면 다시 물어 그 상태를 따른다. 반영 여부를 모르면 결제를
 * 취소하지 않는다.
 *
 * DB 판정은 `lib/supabase/__tests__/payments.test.ts`, 보상 절차는
 * `lib/payments/fulfillment.test.ts`가 봅니다.
 */

const USER = "33333333-3333-4333-8333-333333333333";
const BOOK = "44444444-4444-4444-8444-444444444444";

const DONE: TossPayment = {
  paymentKey: "key-1",
  orderId: "order-1",
  status: "DONE",
  method: "카드",
  totalAmount: 9900,
};

const mocks = vi.hoisted(() => ({
  respond: (() => ({ data: null, error: null })) as (query: RecordedQuery) => QueryResult,
  confirmPayment: vi.fn(),
  getPaymentByOrderId: vi.fn(),
  fulfill: vi.fn(),
  markVoided: vi.fn(),
  cancel: vi.fn(),
  reports: [] as string[],
  txExists: vi.fn(),
}));

vi.mock("@/lib/supabase/server", async () => {
  const { createFakeSupabase } = await import("@/test/fake-supabase");
  return {
    createClient: async () => createFakeSupabase((query) => mocks.respond(query)).client,
  };
});

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  getAuthUser: async () => ({ id: USER }),
}));

vi.mock("@/lib/toss-payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/toss-payments")>()),
  confirmPayment: mocks.confirmPayment,
  getPaymentByOrderId: mocks.getPaymentByOrderId,
}));

vi.mock("@/lib/payments/server", () => ({
  serverFulfillmentPorts: () => ({
    fulfill: mocks.fulfill,
    markVoided: mocks.markVoided,
    cancel: mocks.cancel,
    report: (message: string) => mocks.reports.push(message),
  }),
  paymentTransactionExists: mocks.txExists,
}));

const { POST: confirm } = await import("./confirm/route");
const { POST: webhook } = await import("./webhook/route");
const { TossApiError, TossOutcomeUnknownError } = await import("@/lib/toss-payments");

function transactionRow(overrides: Record<string, unknown> = {}): QueryResult {
  return {
    data: {
      id: "tx-1",
      book_id: BOOK,
      amount: 9900,
      status: "ready",
      purchase_id: null,
      ...overrides,
    },
    error: null,
  };
}

function confirmRequest() {
  return new NextRequest("http://localhost/api/payments/confirm", {
    method: "POST",
    body: JSON.stringify({ paymentKey: "key-1", orderId: "order-1", amount: 9900 }),
  });
}

async function call(): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await confirm(confirmRequest());
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reports = [];
  mocks.respond = () => transactionRow();
  mocks.fulfill.mockResolvedValue({
    outcome: "granted",
    purchase_id: "purchase-1",
    book_id: BOOK,
    user_id: USER,
  });
  mocks.markVoided.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
  mocks.txExists.mockResolvedValue(true);
  vi.unstubAllEnvs();
});

describe("POST /api/payments/confirm", () => {
  it("승인되면 이행한다", async () => {
    mocks.confirmPayment.mockResolvedValue(DONE);

    const { status, body } = await call();

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ status: "completed", purchaseId: "purchase-1" });
  });

  it("결과 모름(5xx·시간 초과) → 재조회해 승인이면 이행한다 — aborted로 덮지 않는다", async () => {
    mocks.confirmPayment.mockRejectedValue(new TossOutcomeUnknownError("timeout"));
    mocks.getPaymentByOrderId.mockResolvedValue(DONE);

    const { status, body } = await call();

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ status: "completed" });
    expect(mocks.markVoided).not.toHaveBeenCalled();
  });

  it("결과 모름 → 재조회해도 아직 승인 전이면 처리 중으로 안내하고 아무것도 바꾸지 않는다", async () => {
    mocks.confirmPayment.mockRejectedValue(
      new TossApiError("IDEMPOTENT_REQUEST_PROCESSING", "처리 중", 409),
    );
    mocks.getPaymentByOrderId.mockResolvedValue({ ...DONE, status: "IN_PROGRESS" });

    const { status, body } = await call();

    expect(status).toBe(202);
    expect(body.data).toMatchObject({ status: "processing" });
    expect(mocks.markVoided).not.toHaveBeenCalled();
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it("결과 모름 → 재조회도 실패하면 처리 중으로 안내한다", async () => {
    mocks.confirmPayment.mockRejectedValue(new TossOutcomeUnknownError("network"));
    mocks.getPaymentByOrderId.mockRejectedValue(new TossOutcomeUnknownError("network"));

    const { status } = await call();

    expect(status).toBe(202);
    expect(mocks.markVoided).not.toHaveBeenCalled();
  });

  it("Toss가 분명히 거절하면 aborted로 남기고 거절 사유를 보여 준다", async () => {
    mocks.confirmPayment.mockRejectedValue(
      new TossApiError("REJECT_CARD_PAYMENT", "한도를 넘었어요", 400),
    );
    mocks.getPaymentByOrderId.mockResolvedValue({ ...DONE, status: "IN_PROGRESS" });

    const { status, body } = await call();

    expect(status).toBe(400);
    expect(body.error).toBe("한도를 넘었어요");
    expect(mocks.markVoided).toHaveBeenCalledWith("order-1", "aborted", null);
  });

  it("이미 처리된 결제가 지금은 취소 상태면 그 상태(canceled)로 남긴다 — aborted로 덮지 않는다", async () => {
    mocks.confirmPayment.mockRejectedValue(
      new TossApiError("ALREADY_PROCESSED_PAYMENT", "이미 처리됨", 400),
    );
    mocks.getPaymentByOrderId.mockResolvedValue({ ...DONE, status: "CANCELED" });

    const { status, body } = await call();

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ status: "refunded" });
    expect(mocks.markVoided).toHaveBeenCalledTimes(1);
    expect(mocks.markVoided.mock.calls[0][1]).toBe("canceled");
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it("이미 취소된 주문은 Toss를 부르지 않고 취소 안내를 돌려준다", async () => {
    mocks.respond = () => transactionRow({ status: "canceled", purchase_id: "purchase-1" });

    const { status, body } = await call();

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ status: "refunded", bookId: null });
    expect(mocks.confirmPayment).not.toHaveBeenCalled();
    expect(mocks.markVoided).not.toHaveBeenCalled();
  });

  it("승인 전에 끝난 주문은 Toss를 부르지 않는다", async () => {
    mocks.respond = () => transactionRow({ status: "expired" });

    const { status } = await call();

    expect(status).toBe(409);
    expect(mocks.confirmPayment).not.toHaveBeenCalled();
  });

  it("이행 RPC가 던지면 결제를 취소하지 않고 처리 중으로 안내한다 (1-P0-4)", async () => {
    mocks.confirmPayment.mockResolvedValue(DONE);
    mocks.fulfill.mockRejectedValue(new Error("db down"));

    const { status, body } = await call();

    expect(status).toBe(202);
    expect(body.data).toMatchObject({ status: "processing" });
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("승인 응답이 입금 대기면 이행하지 않는다 (1-P0-5)", async () => {
    mocks.confirmPayment.mockResolvedValue({ ...DONE, status: "WAITING_FOR_DEPOSIT" });

    const { status } = await call();

    expect(status).toBe(202);
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it("우리 키 설정 오류는 독자의 거절로 보이지 않고, 결제 행도 건드리지 않는다", async () => {
    mocks.confirmPayment.mockRejectedValue(new TossApiError("UNAUTHORIZED_KEY", "키 오류", 401));

    const { status, body } = await call();

    expect(status).toBe(500);
    expect(body.error).not.toBe("키 오류");
    expect(mocks.markVoided).not.toHaveBeenCalled();
  });

  it("결제 행 조회가 실패하면 404가 아니라 500 (DB 장애를 '결제 없음'으로 내지 않는다)", async () => {
    mocks.respond = () => ({ data: null, error: { message: "connection lost" } });

    const { status } = await call();

    expect(status).toBe(500);
    expect(mocks.confirmPayment).not.toHaveBeenCalled();
  });

  it("이행 실패로 환불했으면 '바로 읽기'를 띄울 bookId를 싣지 않는다", async () => {
    mocks.confirmPayment.mockResolvedValue(DONE);
    mocks.fulfill.mockResolvedValue({
      outcome: "voided",
      status: "canceled",
      purchase_id: null,
      book_id: BOOK,
      user_id: USER,
    });

    const { body } = await call();

    expect(body.data).toMatchObject({ status: "refunded", bookId: null });
  });
});

function webhookRequest(options: { secret?: string; header?: string } = {}) {
  const url = new URL("http://localhost/api/payments/webhook");
  if (options.secret) url.searchParams.set("secret", options.secret);
  return new NextRequest(url, {
    method: "POST",
    headers: options.header ? { "x-inspic-webhook-secret": options.header } : {},
    body: JSON.stringify({ eventType: "PAYMENT_STATUS_CHANGED", data: { orderId: "order-1" } }),
  });
}

describe("POST /api/payments/webhook", () => {
  it("승인된 결제를 이행한다", async () => {
    mocks.getPaymentByOrderId.mockResolvedValue(DONE);

    const res = await webhook(webhookRequest());

    expect(res.status).toBe(200);
    expect(mocks.fulfill).toHaveBeenCalledTimes(1);
  });

  it("우리에게 결제 행이 없는 주문은 2xx로 닫고 아무것도 하지 않는다", async () => {
    mocks.txExists.mockResolvedValue(false);

    const res = await webhook(webhookRequest());

    expect(res.status).toBe(200);
    expect(mocks.getPaymentByOrderId).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("Toss에 없는 결제(NOT_FOUND_PAYMENT)는 2xx로 닫는다", async () => {
    mocks.getPaymentByOrderId.mockRejectedValue(
      new TossApiError("NOT_FOUND_PAYMENT", "없음", 404),
    );

    const res = await webhook(webhookRequest());

    expect(res.status).toBe(200);
  });

  it("반영 여부를 모르면 5xx로 Toss 재시도를 받고, 결제는 취소하지 않는다", async () => {
    mocks.getPaymentByOrderId.mockResolvedValue(DONE);
    mocks.fulfill.mockRejectedValue(new Error("db down"));

    const res = await webhook(webhookRequest());

    expect(res.status).toBe(500);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("결제 행 확인이 실패하면 5xx — 진짜 결제의 webhook을 버리지 않는다", async () => {
    mocks.txExists.mockRejectedValue(new Error("db down"));

    const res = await webhook(webhookRequest());

    expect(res.status).toBe(500);
  });

  it("secret을 설정하면 맞지 않는 요청을 막는다", async () => {
    vi.stubEnv("TOSS_WEBHOOK_SECRET", "s3cret");
    mocks.getPaymentByOrderId.mockResolvedValue(DONE);

    expect((await webhook(webhookRequest())).status).toBe(403);
    expect((await webhook(webhookRequest({ header: "wrong" }))).status).toBe(403);
    expect((await webhook(webhookRequest({ header: "s3cret" }))).status).toBe(200);
    expect((await webhook(webhookRequest({ secret: "s3cret" }))).status).toBe(200);
  });
});
