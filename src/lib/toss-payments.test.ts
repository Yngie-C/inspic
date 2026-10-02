// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TossApiError,
  TossOutcomeUnknownError,
  cancelPayment,
  confirmPayment,
  generateOrderId,
  getPaymentByOrderId,
  isOutcomeUnknown,
  isTossConfigError,
} from "./toss-payments";

/**
 * Toss 호출이 "확정 거절"과 "결과 모름"을 나누는지 (코드 리뷰 1-P0-7).
 *
 * 둘을 같은 에러로 던지면 confirm은 승인됐을 수도 있는 결제를
 * `aborted`로 덮습니다.
 */

const PAYMENT = {
  paymentKey: "key-1",
  orderId: "order-1",
  status: "DONE",
  method: "카드",
  totalAmount: 9900,
};

function respondWith(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
}

beforeEach(() => {
  vi.stubEnv("TOSS_SECRET_KEY", "test_sk");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("tossFetch 분류", () => {
  it("2xx 결제는 그대로 돌려준다", async () => {
    vi.stubGlobal("fetch", respondWith(200, PAYMENT));

    await expect(getPaymentByOrderId("order-1")).resolves.toMatchObject(PAYMENT);
  });

  it("4xx는 code를 보존한 확정 거절이다", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith(400, { code: "REJECT_CARD_PAYMENT", message: "한도 초과" }),
    );

    const error = await confirmPayment({ paymentKey: "k", orderId: "o", amount: 1 }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(TossApiError);
    expect(error).toMatchObject({ code: "REJECT_CARD_PAYMENT", httpStatus: 400 });
    expect(isOutcomeUnknown(error)).toBe(false);
  });

  it("5xx는 결과 모름이다", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith(500, { code: "FAILED_INTERNAL_SYSTEM_PROCESSING", message: "x" }),
    );

    const error = await confirmPayment({ paymentKey: "k", orderId: "o", amount: 1 }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(TossOutcomeUnknownError);
    expect(isOutcomeUnknown(error)).toBe(true);
  });

  it("네트워크 오류·시간 초과는 결과 모름이다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timeout", "TimeoutError");
      }),
    );

    await expect(getPaymentByOrderId("order-1")).rejects.toBeInstanceOf(
      TossOutcomeUnknownError,
    );
  });

  it("2xx인데 결제 모양이 아니면 결과 모름이다 — null을 결제로 넘기지 않는다", async () => {
    vi.stubGlobal("fetch", respondWith(200, "<html>gateway</html>"));
    await expect(getPaymentByOrderId("order-1")).rejects.toBeInstanceOf(
      TossOutcomeUnknownError,
    );

    vi.stubGlobal("fetch", respondWith(200, { orderId: "order-1" }));
    await expect(getPaymentByOrderId("order-1")).rejects.toBeInstanceOf(
      TossOutcomeUnknownError,
    );
  });

  it("요청에 시간 제한을 건다", async () => {
    const fetchMock = respondWith(200, PAYMENT);
    vi.stubGlobal("fetch", fetchMock);

    await getPaymentByOrderId("order-1");

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("같은 멱등 키가 처리 중이라는 답과 429는 결과 모름으로 본다", () => {
    expect(
      isOutcomeUnknown(new TossApiError("IDEMPOTENT_REQUEST_PROCESSING", "", 409)),
    ).toBe(true);
    expect(isOutcomeUnknown(new TossApiError("TOO_MANY_REQUESTS", "", 429))).toBe(true);
  });

  it("키 설정 오류는 독자의 거절이 아니다", () => {
    expect(isTossConfigError(new TossApiError("UNAUTHORIZED_KEY", "", 401))).toBe(true);
    expect(isTossConfigError(new TossApiError("INVALID_API_KEY", "", 400))).toBe(true);
    expect(isTossConfigError(new TossApiError("REJECT_CARD_PAYMENT", "", 400))).toBe(false);
  });
});

describe("confirmPayment", () => {
  it("멱등 키로 주문번호를 보낸다 — 동시 승인이 서로 다른 오류를 받지 않게", async () => {
    const fetchMock = respondWith(200, PAYMENT);
    vi.stubGlobal("fetch", fetchMock);

    await confirmPayment({ paymentKey: "key-1", orderId: "order-1", amount: 9900 });

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("order-1");
  });
});

describe("cancelPayment", () => {
  it("이미 취소된 결제는 성공으로 본다", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith(400, { code: "ALREADY_CANCELED_PAYMENT", message: "x" }),
    );

    await expect(cancelPayment("key-1", "중복 결제")).resolves.toBeUndefined();
  });

  it("멱등 키를 고정하지 않는다 — 동시 보상의 두 번째가 '처리 중'으로 실패하지 않게", async () => {
    const fetchMock = respondWith(200, { ...PAYMENT, status: "CANCELED" });
    vi.stubGlobal("fetch", fetchMock);

    await cancelPayment("key-1", "중복 결제");

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
  });
});

describe("generateOrderId", () => {
  it("Toss 규칙(영문·숫자·-·_ 6~64자)을 지키고 매번 다르다", () => {
    const a = generateOrderId("44444444-4444-4444-8444-444444444444");
    const b = generateOrderId("44444444-4444-4444-8444-444444444444");

    expect(a).toMatch(/^[A-Za-z0-9_-]{6,64}$/);
    expect(a).not.toBe(b);
  });
});
