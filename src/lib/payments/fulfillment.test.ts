import { describe, expect, it } from "vitest";
import {
  fulfillApprovedPayment,
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
  fulfill?: FulfillRpcResult | Error;
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
      async cancel(paymentKey, reason) {
        cancelCalls.push({ paymentKey, reason });
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

  it("이행에 실패하면 결제를 취소한다 — 돈이 묶여 있으면 안 된다", async () => {
    const recorder = makePorts({ fulfill: new Error("db down") });

    const result = await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(result.kind).toBe("refunded");
    expect(recorder.cancelCalls).toHaveLength(1);
    expect(recorder.cancelCalls[0].paymentKey).toBe("key-1");
  });

  it("취소한 사실을 결제 행에도 남긴다", async () => {
    const recorder = makePorts({ fulfill: new Error("db down") });

    await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(recorder.voidCalls).toEqual([
      { orderId: "order-1", status: "canceled" },
    ]);
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
  });

  it("이행도 취소도 실패하면 stranded — 성공인 척하지 않는다", async () => {
    const recorder = makePorts({
      fulfill: new Error("db down"),
      cancel: new Error("toss down"),
    });

    const result = await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(result.kind).toBe("stranded");
    expect(recorder.reports.length).toBeGreaterThan(0);
  });

  it("취소는 됐는데 결제 행 갱신이 실패해도 독자에게는 성공한 취소다", async () => {
    // 돈은 이미 돌아갔습니다. 남은 어긋남은 webhook이 정리합니다.
    const recorder = makePorts({
      fulfill: new Error("db down"),
      markVoided: new Error("db still down"),
    });

    const result = await fulfillApprovedPayment(recorder.ports, PAYMENT);

    expect(result.kind).toBe("refunded");
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

    expect(result.kind).toBe("voided");
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
