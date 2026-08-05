import type { PaymentTransactionStatus } from "@/types";

/**
 * Toss의 결제 상태를 우리 쪽 상태로 옮깁니다.
 *
 * 순수 함수만 둡니다. 승인/취소 판정이 라우트 안의 문자열 비교로
 * 흩어지면 confirm과 webhook이 서로 다르게 판단하기 시작합니다.
 */

/** 결제가 지금 어느 단계에 있는가. 이행 여부는 이것 하나로 정합니다. */
export type PaymentPhase =
  /** 아직 결론이 나지 않음. 아무것도 이행하지 않습니다. */
  | "pending"
  /** 승인 완료. 구매를 열어 줘야 합니다. */
  | "settled"
  /** 취소·중단·만료. 열려 있던 구매가 있으면 닫아야 합니다. */
  | "voided";

const TOSS_TO_TRANSACTION: Record<string, PaymentTransactionStatus> = {
  READY: "ready",
  IN_PROGRESS: "in_progress",
  // 가상계좌 입금 대기. 결제 수단을 카드로만 열어 두었으므로 정상
  // 경로에서는 오지 않지만, 오면 "아직 안 끝남"으로 다룹니다.
  WAITING_FOR_DEPOSIT: "in_progress",
  DONE: "done",
  CANCELED: "canceled",
  PARTIAL_CANCELED: "partial_canceled",
  ABORTED: "aborted",
  EXPIRED: "expired",
};

const VOID_PHASES = new Set<PaymentTransactionStatus>([
  "canceled",
  "partial_canceled",
  "aborted",
  "expired",
]);

/**
 * 모르는 상태는 `ready`로 봅니다.
 *
 * Toss가 상태를 새로 만들었을 때 그것을 승인이나 취소로 넘겨짚는 것보다,
 * 아무것도 하지 않고 다음 webhook을 기다리는 쪽이 안전합니다.
 */
export function transactionStatus(
  tossStatus: string,
): PaymentTransactionStatus {
  return TOSS_TO_TRANSACTION[tossStatus] ?? "ready";
}

export function paymentPhase(tossStatus: string): PaymentPhase {
  const status = TOSS_TO_TRANSACTION[tossStatus];
  if (status === undefined) return "pending";
  if (status === "done") return "settled";
  return VOID_PHASES.has(status) ? "voided" : "pending";
}
