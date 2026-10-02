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
  /** 구매를 새로 열었습니다 (닫혀 있던 구매를 되살린 경우 포함). */
  | { kind: "granted"; purchaseId: string; bookId: string }
  /** 이미 반영된 결제입니다. 두 번 열지 않았습니다. */
  | { kind: "already"; purchaseId: string; bookId: string }
  /**
   * 열어 주지 못해 결제를 취소했습니다. 독자에게 돈은 돌아갑니다.
   * 중복 결제였다면 이미 보유한 책이 있으므로 `bookId`가 실립니다.
   */
  | { kind: "refunded"; reason: string; bookId?: string }
  /** 이행도 취소도 실패. 돈은 나갔는데 책은 닫혀 있습니다. */
  | { kind: "stranded"; reason: string }
  /**
   * 이행 RPC가 던져 반영됐는지 모릅니다. 보상하지 않았습니다 — RPC가
   * 커밋된 뒤 응답만 잃었을 수 있고, 일시적인 DB 장애라면 재시도로
   * 풀립니다. webhook은 5xx로 Toss 재시도를 받고, 성공 화면은
   * "처리 중"으로 안내합니다.
   */
  | { kind: "deferred" }
  /** 아직 승인 상태가 아닙니다. 아무것도 하지 않았습니다. */
  | { kind: "pending" };

export type ReconcileResult =
  | FulfillmentResult
  /** 취소·중단·만료를 결제 행에 반영했습니다. */
  | { kind: "voided"; status: PaymentTransactionStatus };

export interface FulfillArgs {
  orderId: string;
  paymentKey: string;
  amount: number;
  method: string | null;
  raw: unknown;
}

/** `fulfill_payment` RPC의 반환 (마이그레이션 00005). */
export type FulfillRpcResult =
  | {
      outcome:
        | "granted"
        | "restored"
        | "already_fulfilled"
        | "duplicate_purchase";
      purchase_id: string;
      book_id: string;
      user_id: string;
    }
  | {
      outcome: "voided";
      status: string;
      purchase_id: string | null;
      book_id: string;
      user_id: string;
    };

export interface FulfillmentPorts {
  /** `fulfill_payment` RPC. 실패하면 던집니다. 반환은 검증 전 원본입니다. */
  fulfill(args: FulfillArgs): Promise<unknown>;
  /** `void_payment` RPC. 취소를 결제 행과 구매 상태에 반영합니다. */
  markVoided(
    orderId: string,
    status: PaymentTransactionStatus,
    raw: unknown,
  ): Promise<void>;
  /** Toss 결제 취소. 이미 취소된 결제면 성공입니다. */
  cancel(payment: TossPayment, reason: string): Promise<void>;
  /** 사람이 봐야 하는 사건. */
  report(message: string, detail: unknown): void;
}

const DUPLICATE_REASON = "이미 가지고 있는 책이라 이번 결제는 자동으로 취소했어요.";
const VOIDED_REASON =
  "이미 취소됐거나 끝난 결제라 책을 열지 않았어요. 결제한 금액은 자동으로 취소돼요.";
const STRANDED_REASON =
  "결제는 됐지만 처리를 끝내지 못했어요. contact@inspic.kr로 알려 주시면 바로 확인할게요.";

const ROW_OUTCOMES = new Set([
  "granted",
  "restored",
  "already_fulfilled",
  "duplicate_purchase",
]);

/**
 * RPC 반환을 알려진 모양으로만 받습니다.
 *
 * 캐스팅만 하면 모르는 outcome이 "이미 반영됨"으로 흘러가 성공 화면이
 * 뜹니다. 모양이 다르면 `null`이고, 호출자는 그것을 사고로 다룹니다.
 */
export function parseFulfillRpcResult(data: unknown): FulfillRpcResult | null {
  if (typeof data !== "object" || data === null) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.book_id !== "string" || typeof row.user_id !== "string") {
    return null;
  }

  if (row.outcome === "voided") {
    if (typeof row.status !== "string") return null;
    if (row.purchase_id !== null && typeof row.purchase_id !== "string") {
      return null;
    }
    return {
      outcome: "voided",
      status: row.status,
      purchase_id: row.purchase_id,
      book_id: row.book_id,
      user_id: row.user_id,
    };
  }

  if (typeof row.outcome !== "string" || !ROW_OUTCOMES.has(row.outcome)) {
    return null;
  }
  if (typeof row.purchase_id !== "string") return null;

  return {
    outcome: row.outcome as Exclude<FulfillRpcResult["outcome"], "voided">,
    purchase_id: row.purchase_id,
    book_id: row.book_id,
    user_id: row.user_id,
  };
}

/**
 * 승인이 끝난 결제 하나를 반영합니다.
 *
 * Toss에게 되묻지 않고 넘겨받은 것을 사실로 씁니다. 다만 승인 상태가
 * 아닌 결제는 이행하지 않습니다 — 승인 응답이 `WAITING_FOR_DEPOSIT`이나
 * `IN_PROGRESS`로 올 수도 있고, 결제 수단을 카드로 제한한 것은
 * 브라우저뿐입니다.
 */
export async function fulfillApprovedPayment(
  ports: FulfillmentPorts,
  payment: TossPayment,
): Promise<FulfillmentResult> {
  if (paymentPhase(payment.status) !== "settled") {
    return { kind: "pending" };
  }

  let raw: unknown;
  try {
    raw = await ports.fulfill({
      orderId: payment.orderId,
      paymentKey: payment.paymentKey,
      // 금액은 클라이언트가 보낸 값이 아니라 Toss가 승인한 값을 씁니다.
      amount: payment.totalAmount,
      method: payment.method ?? null,
      raw: payment,
    });
  } catch (error) {
    // 확정된 실패가 아닙니다. 여기서 결제를 취소하면 DB가 잠깐
    // 끊겼다는 이유로 정상 결제가 환불되고, RPC가 커밋된 뒤 응답만
    // 잃었다면 열린 책까지 닫힙니다.
    ports.report("결제 반영 여부를 모릅니다 — 재시도를 기다립니다", {
      orderId: payment.orderId,
      error,
    });
    return { kind: "deferred" };
  }

  const result = parseFulfillRpcResult(raw);
  if (!result) {
    ports.report("fulfill_payment가 알 수 없는 결과를 돌려줬습니다 — 수동 확인이 필요합니다", {
      orderId: payment.orderId,
      raw,
    });
    return { kind: "stranded", reason: STRANDED_REASON };
  }

  switch (result.outcome) {
    case "duplicate_purchase":
      return compensate(
        ports,
        payment,
        DUPLICATE_REASON,
        "중복 결제",
        result.book_id,
      );

    case "voided":
      // 결제 행은 이미 취소·만료됐는데 손에 든 결제는 DONE입니다.
      // 대개는 취소가 먼저 반영된 뒤 도착한 옛 승인 응답이고, 그때
      // Toss 취소는 "이미 취소됨"으로 끝납니다. 아니라면 돈이 나간
      // 결제이므로 돌려줘야 합니다.
      ports.report("종결된 결제 행에 승인 결제가 들어왔습니다", {
        orderId: payment.orderId,
        status: result.status,
      });
      return compensate(ports, payment, VOIDED_REASON, "종결된 결제");

    case "restored":
      ports.report("승인된 결제의 닫혀 있던 구매를 다시 열었습니다", {
        orderId: payment.orderId,
        purchaseId: result.purchase_id,
      });
      return {
        kind: "granted",
        purchaseId: result.purchase_id,
        bookId: result.book_id,
      };

    case "granted":
      return {
        kind: "granted",
        purchaseId: result.purchase_id,
        bookId: result.book_id,
      };

    case "already_fulfilled":
      return {
        kind: "already",
        purchaseId: result.purchase_id,
        bookId: result.book_id,
      };
  }
}

/**
 * 결제 하나의 현재 상태를 DB에 맞춥니다.
 *
 * webhook과 성공 화면이 쓰는 진입점입니다. Toss에서 받아 온 결제를
 * 넘기세요. 승인이면 이행하고, 취소·만료면 열려 있던 구매를 닫습니다.
 */
export async function reconcilePayment(
  ports: FulfillmentPorts,
  payment: TossPayment,
): Promise<ReconcileResult> {
  const phase = paymentPhase(payment.status);

  if (phase === "settled") {
    return fulfillApprovedPayment(ports, payment);
  }

  if (phase === "voided") {
    const status = transactionStatus(payment.status);
    await ports.markVoided(payment.orderId, status, payment);
    return { kind: "voided", status };
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
    await ports.cancel(payment, cancelReason);
  } catch (error) {
    ports.report("결제 취소 보상에 실패했습니다 — 수동 확인이 필요합니다", {
      orderId: payment.orderId,
      paymentKey: payment.paymentKey,
      error,
    });
    return { kind: "stranded", reason: STRANDED_REASON };
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
