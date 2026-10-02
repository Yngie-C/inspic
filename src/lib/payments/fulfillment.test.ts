import { describe, expect, it } from "vitest";
import {
  fulfillApprovedPayment,
  parseFulfillRpcResult,
  reconcilePayment,
  type FulfillArgs,
  type FulfillRpcResult,
  type FulfillmentPorts,
} from "./fulfillment";
import type { TossPayment } from "@/lib/toss-payments";

/**
 * 이행 실패의 보상 — 실제 결제로는 재현하기 어려운 경로입니다.
 *
 * 여기서 지키는 것: **돈이 나갔으면 책이 열리거나, 책이 열리지 않으면
 * 돈이 돌아간다.** 둘 다 못 하면 성공인 척하지 않고 stranded로 남깁니다.
 *
 * DB 쪽 판정(멱등·중복·취소)은 `lib/supabase/__tests__/payments.test.ts`가
 * 실제 Postgres에서 봅니다. 여기는 그 결과를 받아 무엇을 되돌리는지만
 * 봅니다.
 */

const PAYMENT: TossPayment = {
  paymentKey: "key-1",
  orderId: "order-1",
  status: "DONE",
  method: "카드",
  totalAmount: 9900,
};

interface Recorder {
  ports: FulfillmentPorts;
  fulfillCalls: FulfillArgs[];
  cancelCalls: Array<{ paymentKey: string; reason: string }>;
  voidCalls: Array<{ orderId: string; status: string }>;
  reports: string[];
}

function makePorts(options: {
  fulfill?: FulfillRpcResult | Error | Record<string, unknown>;
  cancel?: Error;
  markVoided?: Error;
} = {}): Recorder {
  const fulfillCalls: FulfillArgs[] = [];
  const cancelCalls: Array<{ paymentKey: string; reason: string }> = [];
  const voidCalls: Array<{ orderId: string; status: string }> = [];
  const reports: string[] = [];

  const fulfillResult = options.fulfill ?? {
    outcome: "granted" as const,
    purchase_id: "purchase-1",
    book_id: "book-1",
    user_id: "user-1",
  };

  return {
    fulfillCalls,
    cancelCalls,
    voidCalls,
    reports,
    ports: {
      async fulfill(args) {
        fulfillCalls.push(args);
        if (fulfillResult instanceof Error) throw fulfillResult;
        return fulfillResult;
      },
      async markVoided(orderId, status) {
        voidCalls.push({ orderId, status });
        if (options.markVoided) throw options.markVoided;
      },
      async cancel(payment, reason) {
        cancelCalls.push({ paymentKey: payment.paymentKey, reason });
        if (options.cancel) throw options.cancel;
      },
      report(message) {
        reports.push(message);
      },
    },
  };
}

describe("fulfillApprovedPayment", () => {
  it("승인 금액은 Toss가 준 값을 쓴다", async () => {
    const recorder = makePorts();

    await fulfillApprovedPayment(recorder.ports, { ...PAYMENT, totalAmount: 9900 });

    expect(recorder.fulfillCalls[0]).toMatchObject({
      orderId: "order-1",
      paymentKey: "key-1",
      amount: 9900,
      method: "카드",
    });
  });

  it("이행되면 취소하지 않는다", async () => {
    const recorder = makePorts();

    const result = await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(result).toEqual({
      kind: "granted",
      purchaseId: "purchase-1",
      bookId: "book-1",
    });
    expect(recorder.cancelCalls).toEqual([]);
  });

  it("이미 반영된 결제는 already로 돌려주고 취소하지 않는다", async () => {
    const recorder = makePorts({
      fulfill: {
        outcome: "already_fulfilled",
        purchase_id: "purchase-1",
        book_id: "book-1",
        user_id: "user-1",
      },
    });

    const result = await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(result.kind).toBe("already");
    expect(recorder.cancelCalls).toEqual([]);
  });

  it("이행 RPC가 던지면 취소하지 않고 deferred — 일시 오류로 정상 결제를 환불하지 않는다 (1-P0-4)", async () => {
    // RPC가 커밋된 뒤 응답만 잃었을 수도 있습니다. 여기서 취소하면
    // 열린 책까지 닫힙니다. webhook 재시도가 마무리합니다.
    const recorder = makePorts({ fulfill: new Error("db down") });

    const result = await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(result).toEqual({ kind: "deferred" });
    expect(recorder.cancelCalls).toEqual([]);
    expect(recorder.voidCalls).toEqual([]);
    expect(recorder.reports.length).toBeGreaterThan(0);
  });

  it("승인 상태가 아닌 결제는 이행하지 않는다 (1-P0-5)", async () => {
    for (const status of ["WAITING_FOR_DEPOSIT", "IN_PROGRESS", "CANCELED", "NEW_STATUS"]) {
      const recorder = makePorts();

      const result = await fulfillApprovedPayment(recorder.ports, {
        ...PAYMENT,
        status,
      });

      expect(result).toEqual({ kind: "pending" });
      expect(recorder.fulfillCalls).toEqual([]);
      expect(recorder.cancelCalls).toEqual([]);
    }
  });

  it("중복 결제는 취소하고, 이미 가진 책을 알려 준다", async () => {
    const recorder = makePorts({
      fulfill: {
        outcome: "duplicate_purchase",
        purchase_id: "purchase-1",
        book_id: "book-1",
        user_id: "user-1",
      },
    });

    const result = await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(result).toMatchObject({ kind: "refunded", bookId: "book-1" });
    expect(recorder.cancelCalls).toHaveLength(1);
    expect(recorder.voidCalls).toEqual([
      { orderId: "order-1", status: "canceled" },
    ]);
  });

  it("결제 행이 이미 종결됐으면 열지 않고 결제를 취소한다 (2-P0-3)", async () => {
    // 취소가 먼저 반영된 뒤 도착한 옛 승인 응답입니다. Toss 취소는
    // "이미 취소됨"으로 끝나고, 아니라면 돈을 돌려줍니다.
    const recorder = makePorts({
      fulfill: {
        outcome: "voided",
        status: "canceled",
        purchase_id: null,
        book_id: "book-1",
        user_id: "user-1",
      },
    });

    const result = await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(result.kind).toBe("refunded");
    // 이미 가진 책이 아니므로 "바로 읽기"를 띄울 bookId가 없습니다.
    expect(result).not.toHaveProperty("bookId", "book-1");
    expect(recorder.cancelCalls).toHaveLength(1);
  });

  it("닫혀 있던 구매를 되살렸으면 granted이고 사람에게 알린다 (1-P0-3)", async () => {
    const recorder = makePorts({
      fulfill: {
        outcome: "restored",
        purchase_id: "purchase-1",
        book_id: "book-1",
        user_id: "user-1",
      },
    });

    const result = await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(result).toEqual({
      kind: "granted",
      purchaseId: "purchase-1",
      bookId: "book-1",
    });
    expect(recorder.cancelCalls).toEqual([]);
    expect(recorder.reports.length).toBeGreaterThan(0);
  });

  it("RPC가 모르는 결과를 돌려주면 성공으로 넘기지 않고 stranded", async () => {
    const recorder = makePorts({
      fulfill: {
        outcome: "something_new",
        purchase_id: "purchase-1",
        book_id: "book-1",
        user_id: "user-1",
      },
    });

    const result = await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(result.kind).toBe("stranded");
    expect(recorder.cancelCalls).toEqual([]);
    expect(recorder.reports.length).toBeGreaterThan(0);
  });

  it("보상 취소까지 실패하면 stranded — 성공인 척하지 않는다", async () => {
    const recorder = makePorts({
      fulfill: {
        outcome: "duplicate_purchase",
        purchase_id: "purchase-1",
        book_id: "book-1",
        user_id: "user-1",
      },
      cancel: new Error("toss down"),
    });

    const result = await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(result.kind).toBe("stranded");
    expect(recorder.reports.length).toBeGreaterThan(0);
  });

  it("취소는 됐는데 결제 행 갱신이 실패해도 독자에게는 성공한 취소다", async () => {
    // 돈은 이미 돌아갔습니다. 남은 어긋남은 webhook이 정리합니다.
    const recorder = makePorts({
      fulfill: {
        outcome: "duplicate_purchase",
        purchase_id: "purchase-1",
        book_id: "book-1",
        user_id: "user-1",
      },
      markVoided: new Error("db still down"),
    });

    const result = await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(result.kind).toBe("refunded");
  });
});

describe("parseFulfillRpcResult", () => {
  it("알려진 결과만 받는다", () => {
    expect(
      parseFulfillRpcResult({
        outcome: "granted",
        purchase_id: "p",
        book_id: "b",
        user_id: "u",
      }),
    ).toMatchObject({ outcome: "granted" });
    expect(
      parseFulfillRpcResult({
        outcome: "voided",
        status: "canceled",
        purchase_id: null,
        book_id: "b",
        user_id: "u",
      }),
    ).toMatchObject({ outcome: "voided", status: "canceled" });
  });

  it("모양이 다르면 null", () => {
    expect(parseFulfillRpcResult(null)).toBeNull();
    expect(parseFulfillRpcResult("granted")).toBeNull();
    expect(
      parseFulfillRpcResult({ outcome: "granted", book_id: "b", user_id: "u" }),
    ).toBeNull();
    expect(
      parseFulfillRpcResult({
        outcome: "granted;drop",
        purchase_id: "p",
        book_id: "b",
        user_id: "u",
      }),
    ).toBeNull();
  });
});

describe("reconcilePayment", () => {
  it("승인된 결제는 이행한다", async () => {
    const recorder = makePorts();

    const result = await reconcilePayment(recorder.ports, PAYMENT);

    expect(result.kind).toBe("granted");
    expect(recorder.fulfillCalls).toHaveLength(1);
  });

  it("취소된 결제는 이행하지 않고 되돌린다", async () => {
    const recorder = makePorts();

    const result = await reconcilePayment(recorder.ports, {
      ...PAYMENT,
      status: "CANCELED",
    });

    expect(result).toEqual({ kind: "voided", status: "canceled" });
    expect(recorder.fulfillCalls).toEqual([]);
    expect(recorder.voidCalls).toEqual([
      { orderId: "order-1", status: "canceled" },
    ]);
  });

  it("만료된 결제도 되돌린다", async () => {
    const recorder = makePorts();

    await reconcilePayment(recorder.ports, { ...PAYMENT, status: "EXPIRED" });

    expect(recorder.voidCalls).toEqual([
      { orderId: "order-1", status: "expired" },
    ]);
  });

  it("아직 결론이 나지 않은 결제는 건드리지 않는다", async () => {
    const recorder = makePorts();

    const result = await reconcilePayment(recorder.ports, {
      ...PAYMENT,
      status: "IN_PROGRESS",
    });

    expect(result.kind).toBe("pending");
    expect(recorder.fulfillCalls).toEqual([]);
    expect(recorder.voidCalls).toEqual([]);
  });

  it("모르는 상태는 승인으로도 취소로도 넘겨짚지 않는다", async () => {
    const recorder = makePorts();

    const result = await reconcilePayment(recorder.ports, {
      ...PAYMENT,
      status: "SOMETHING_NEW",
    });

    expect(result.kind).toBe("pending");
    expect(recorder.fulfillCalls).toEqual([]);
    expect(recorder.voidCalls).toEqual([]);
  });
});
