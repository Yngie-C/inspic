// Toss Payments 서버 사이드 유틸리티
//
// 이 파일은 Toss에 말을 거는 일만 합니다. 무엇을 이행할지, 실패했을
// 때 무엇을 되돌릴지는 `lib/payments/`가 정합니다.

const TOSS_API_URL = "https://api.tosspayments.com/v1";

export interface TossPayment {
  paymentKey: string;
  orderId: string;
  /** READY / IN_PROGRESS / WAITING_FOR_DEPOSIT / DONE / CANCELED / PARTIAL_CANCELED / ABORTED / EXPIRED */
  status: string;
  method: string | null;
  totalAmount: number;
  balanceAmount?: number;
  requestedAt?: string;
  approvedAt?: string | null;
  [key: string]: unknown;
}

/**
 * Toss가 돌려준 에러. `code`를 보존하는 것이 핵심입니다.
 *
 * 승인 재시도가 성공으로 이어질지(ALREADY_PROCESSED_PAYMENT), 아니면
 * 결제 자체가 죽었는지(NOT_FOUND_PAYMENT_SESSION)를 메시지 문자열로
 * 구분하려 들면 Toss가 문구를 바꿀 때 조용히 어긋납니다.
 */
export class TossApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "TossApiError";
  }
}

/** 이미 승인된 결제를 다시 승인하려 했다 — 실패가 아니라 재확인 신호입니다. */
export const ALREADY_PROCESSED = "ALREADY_PROCESSED_PAYMENT";
/** 이미 취소된 결제를 다시 취소하려 했다 — 취소 보상에서는 성공으로 봅니다. */
export const ALREADY_CANCELED = "ALREADY_CANCELED_PAYMENT";

function secretKey(): string {
  const key = process.env.TOSS_SECRET_KEY;
  if (!key) {
    throw new Error("TOSS_SECRET_KEY가 설정되지 않았습니다.");
  }
  return key;
}

async function tossFetch(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string },
): Promise<TossPayment> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${secretKey()}:`).toString("base64")}`,
    "Content-Type": "application/json",
  };
  // 같은 취소 요청이 두 번 나가도 한 번만 처리되게 합니다. 보상은
  // 재시도되는 경로라 이게 없으면 부분 취소가 겹칠 수 있습니다.
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const response = await fetch(`${TOSS_API_URL}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload ?? {}) as { code?: string; message?: string };
    throw new TossApiError(
      error.code ?? "UNKNOWN",
      error.message ?? "결제를 처리하지 못했어요.",
      response.status,
    );
  }

  return payload as TossPayment;
}

/** 결제 승인. 성공하면 이 시점에 실제로 돈이 빠져나갑니다. */
export function confirmPayment(params: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossPayment> {
  return tossFetch("/payments/confirm", { method: "POST", body: params });
}

/**
 * 주문번호로 결제 조회.
 *
 * webhook 본문과 재확인 양쪽에서 씁니다. 무엇을 이행할지는 남이 보낸
 * 본문이 아니라 여기서 받은 것으로 정합니다.
 */
export function getPaymentByOrderId(orderId: string): Promise<TossPayment> {
  return tossFetch(`/payments/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
  });
}

/**
 * 결제 취소(전액).
 *
 * 승인은 됐는데 구매 기록을 만들지 못했을 때의 보상입니다. 이미
 * 취소된 결제는 성공으로 봅니다 — 보상은 재시도되는 경로이고,
 * "이미 취소됨"은 원하는 결과와 같습니다.
 */
export async function cancelPayment(
  paymentKey: string,
  reason: string,
  idempotencyKey?: string,
): Promise<void> {
  try {
    await tossFetch(`/payments/${encodeURIComponent(paymentKey)}/cancel`, {
      method: "POST",
      body: { cancelReason: reason },
      idempotencyKey,
    });
  } catch (error) {
    if (error instanceof TossApiError && error.code === ALREADY_CANCELED) return;
    throw error;
  }
}

export function generateOrderId(bookId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `PB_${bookId.substring(0, 8)}_${timestamp}_${random}`;
}
