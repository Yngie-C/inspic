import type { TossPayment } from "@/lib/toss-payments";
import type { PaymentTransactionStatus } from "@/types";
import { paymentPhase, transactionStatus } from "./status";

/**
 * 승인된 결제를 구매로 바꾸는 절차.
 *
 * 성공 화면(`/api/payments/confirm`)과 webhook이 같은 코드를 씁니다.
 * 두 벌로 두면 한쪽만 고쳐진 상태가 되고, 그때 생기는 어긋남이 바로
 * "승인은 됐는데 구매 기록이 없는" 상태입니다.
 *
 * 여기서 지키는 것은 하나입니다: **돈이 나갔으면 책이 열리거나,
 * 책이 열리지 않으면 돈이 돌아간다.** 둘 다 못 하면 조용히 넘어가지
 * 않고 `stranded`로 돌려 사람이 보게 합니다.
 *
 * DB와 Toss를 직접 부르지 않고 포트로 받는 것은 테스트 때문입니다.
 * 보상 경로는 실제 결제를 재현하기 어려운데, 여기서 틀리면 바로
 * 돈 문제가 됩니다.
 */

export type FulfillmentResult =
  /** 구매를 새로 만들었습니다. */
  | { kind: "granted"; purchaseId: string; bookId: string }
  /** 이미 반영된 결제입니다. 두 번 열지 않았습니다. */
  | { kind: "already"; purchaseId: string; bookId: string }
  /**
   * 열어 주지 못해 결제를 취소했습니다. 독자에게 돈은 돌아갑니다.
   * 중복 결제였다면 이미 보유한 책이 있으므로 `bookId`가 실립니다.
   */
  | { kind: "refunded"; reason: string; bookId?: string }
  /** 이행도 취소도 실패. 돈은 나갔는데 책은 닫혀 있습니다. */
  | { kind: "stranded"; reason: string };

export interface FulfillArgs {
  orderId: string;
  paymentKey: string;
  amount: number;
  method: string | null;
  raw: unknown;
}

export interface FulfillRpcResult {
  outcome: "granted" | "already_fulfilled" | "duplicate_purchase";
  purchase_id: string;
  book_id: string;
  user_id: string;
}

export interface FulfillmentPorts {
  /** `fulfill_payment` RPC. 실패하면 던집니다. */
  fulfill(args: FulfillArgs): Promise<FulfillRpcResult>;
  /** `void_payment` RPC. 취소를 결제 행과 구매 상태에 반영합니다. */
  markVoided(
    orderId: string,
    status: PaymentTransactionStatus,
    raw: unknown,
  ): Promise<void>;
  /** Toss 결제 취소. */
  cancel(paymentKey: string, reason: string): Promise<void>;
  /** 사람이 봐야 하는 사건. */
  report(message: string, detail: unknown): void;
}

const DUPLICATE_REASON = "이미 가지고 있는 책이라 이번 결제는 자동으로 취소했어요.";
const FAILURE_REASON = "구매를 처리하지 못해 결제를 자동으로 취소했어요. 다시 결제해 주세요.";

/**
 * 승인이 끝난 결제 하나를 반영합니다.
 *
 * 호출 전에 `payment`가 실제로 승인 상태인지 확인하세요. 이 함수는
 * Toss에게 되묻지 않고 넘겨받은 것을 사실로 씁니다.
 */
export async function fulfillApprovedPayment(
  ports: FulfillmentPorts,
  payment: TossPayment,
): Promise<FulfillmentResult> {
  let result: FulfillRpcResult;

  try {
    result = await ports.fulfill({
      orderId: payment.orderId,
      paymentKey: payment.paymentKey,
      // 금액은 클라이언트가 보낸 값이 아니라 Toss가 승인한 값을 씁니다.
      amount: payment.totalAmount,
      method: payment.method ?? null,
      raw: payment,
    });
  } catch (error) {
    ports.report("결제를 구매로 반영하지 못했습니다", {
      orderId: payment.orderId,
      error,
    });
    return compensate(ports, payment, FAILURE_REASON, "구매 기록 생성 실패");
  }

  if (result.outcome === "duplicate_purchase") {
    return compensate(
      ports,
      payment,
      DUPLICATE_REASON,
      "중복 결제",
      result.book_id,
    );
  }

  return {
    kind: result.outcome === "granted" ? "granted" : "already",
    purchaseId: result.purchase_id,
    bookId: result.book_id,
  };
}

/**
 * 결제 하나의 현재 상태를 DB에 맞춥니다.
 *
 * webhook이 쓰는 진입점입니다. Toss에서 다시 읽어 온 결제를 넘기세요.
 * 승인이면 이행하고, 취소·만료면 열려 있던 구매를 닫습니다.
 */
export async function reconcilePayment(
  ports: FulfillmentPorts,
  payment: TossPayment,
): Promise<FulfillmentResult | { kind: "voided" } | { kind: "pending" }> {
  const phase = paymentPhase(payment.status);

  if (phase === "settled") {
    return fulfillApprovedPayment(ports, payment);
  }

  if (phase === "voided") {
    await ports.markVoided(
      payment.orderId,
      transactionStatus(payment.status),
      payment,
    );
    return { kind: "voided" };
  }

  return { kind: "pending" };
}

/**
 * 열어 주지 못한 결제를 되돌립니다.
 *
 * 취소가 되면 독자 입장에서는 깔끔한 실패입니다. 취소까지 실패하면
 * 그때가 진짜 사고이므로 `stranded`로 구분합니다 — 여기서 조용히
 * 성공을 돌려주면 돈이 나간 것을 아무도 모르게 됩니다.
 */
async function compensate(
  ports: FulfillmentPorts,
  payment: TossPayment,
  userMessage: string,
  cancelReason: string,
  bookId?: string,
): Promise<FulfillmentResult> {
  try {
    await ports.cancel(payment.paymentKey, cancelReason);
  } catch (error) {
    ports.report("결제 취소 보상에 실패했습니다 — 수동 확인이 필요합니다", {
      orderId: payment.orderId,
      paymentKey: payment.paymentKey,
      error,
    });
    return {
      kind: "stranded",
      reason:
        "결제는 됐지만 처리를 끝내지 못했어요. contact@inspic.kr로 알려 주시면 바로 확인할게요.",
    };
  }

  // 돈은 이미 돌아갔습니다. 결제 행 갱신이 실패해도 독자에게는
  // 성공한 취소이고, 남은 어긋남은 webhook이 정리합니다.
  try {
    await ports.markVoided(payment.orderId, "canceled", payment);
  } catch (error) {
    ports.report("취소는 됐지만 결제 상태를 갱신하지 못했습니다", {
      orderId: payment.orderId,
      error,
    });
  }

  return { kind: "refunded", reason: userMessage, bookId };
}
