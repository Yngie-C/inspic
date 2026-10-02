// Toss Payments 서버 사이드 유틸리티
//
// 이 파일은 Toss에 말을 거는 일만 합니다. 무엇을 이행할지, 실패했을
// 때 무엇을 되돌릴지는 `lib/payments/`가 정합니다.

const TOSS_API_URL = "https://api.tosspayments.com/v1";

/**
 * Toss 호출 하나를 기다리는 최대 시간.
 *
 * 없으면 Toss가 멈췄을 때 함수 제한 시간까지 같이 멈추고, 그 뒤에
 * 와야 할 보상·`stranded` 보고가 하나도 실행되지 않습니다.
 */
const TOSS_TIMEOUT_MS = 10_000;

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
 *
 * 이 에러는 **Toss가 요청을 받고 답한 것**입니다. 답을 받지 못한
 * 경우는 `TossOutcomeUnknownError`입니다.
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

/**
 * 요청이 Toss에서 어떻게 끝났는지 모릅니다 — 네트워크 오류, 시간 초과,
 * Toss 5xx, 알아볼 수 없는 응답.
 *
 * 승인 요청이라면 **승인됐을 수도 있습니다.** 이것을 거절로 다루면
 * 실제로 돈이 나간 결제를 `aborted`로 덮게 되므로, 호출자는 결제를
 * 다시 조회해 그 상태를 따라야 합니다.
 */
export class TossOutcomeUnknownError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "TossOutcomeUnknownError";
  }
}

/** 이미 승인된 결제를 다시 승인하려 했다 — 실패가 아니라 재확인 신호입니다. */
export const ALREADY_PROCESSED = "ALREADY_PROCESSED_PAYMENT";
/** 이미 취소된 결제를 다시 취소하려 했다 — 취소 보상에서는 성공으로 봅니다. */
export const ALREADY_CANCELED = "ALREADY_CANCELED_PAYMENT";
/** 같은 멱등 키의 요청이 아직 처리 중이다 — 결과를 모르는 것과 같습니다. */
export const IDEMPOTENT_REQUEST_PROCESSING = "IDEMPOTENT_REQUEST_PROCESSING";
/** 주문번호로 찾은 결제가 없다. */
export const NOT_FOUND_PAYMENT = "NOT_FOUND_PAYMENT";

/** 우리 쪽 키 설정이 잘못됐을 때 Toss가 내는 코드. 독자의 결제 거절이 아닙니다. */
const CONFIG_ERROR_CODES = new Set([
  "UNAUTHORIZED_KEY",
  "INVALID_API_KEY",
  "INCORRECT_BASIC_AUTH_FORMAT",
]);

/**
 * 우리 서버 설정의 문제인가.
 *
 * 이것을 독자에게 "결제가 거절됐어요"로 보여 주면 독자는 카드를 바꿔
 * 가며 다시 시도하고, 우리는 키가 틀렸다는 것을 모릅니다.
 */
export function isTossConfigError(error: unknown): boolean {
  if (!(error instanceof TossApiError)) return false;
  return (
    error.httpStatus === 401 ||
    error.httpStatus === 403 ||
    CONFIG_ERROR_CODES.has(error.code)
  );
}

/**
 * 결과가 확정되지 않은 실패인가 — 다시 조회해 봐야 하는가.
 *
 * Toss가 4xx로 분명히 거절한 것만 "확정"입니다. 같은 멱등 키의 요청이
 * 처리 중이라는 답과 429(요청 과다)는 아직 아무것도 정해지지 않았다는
 * 뜻이므로 결과 모름으로 봅니다.
 */
export function isOutcomeUnknown(error: unknown): boolean {
  if (error instanceof TossOutcomeUnknownError) return true;
  return (
    error instanceof TossApiError &&
    (error.code === IDEMPOTENT_REQUEST_PROCESSING || error.httpStatus === 429)
  );
}

function secretKey(): string {
  const key = process.env.TOSS_SECRET_KEY;
  if (!key) {
    throw new Error("TOSS_SECRET_KEY가 설정되지 않았습니다.");
  }
  return key;
}

function isTossPayment(value: unknown): value is TossPayment {
  if (typeof value !== "object" || value === null) return false;
  const payment = value as Record<string, unknown>;
  return (
    typeof payment.paymentKey === "string" &&
    typeof payment.orderId === "string" &&
    typeof payment.status === "string" &&
    typeof payment.totalAmount === "number" &&
    (payment.method === undefined ||
      payment.method === null ||
      typeof payment.method === "string")
  );
}

async function tossFetch(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string },
): Promise<TossPayment> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${secretKey()}:`).toString("base64")}`,
    "Content-Type": "application/json",
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${TOSS_API_URL}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TOSS_TIMEOUT_MS),
    });
  } catch (error) {
    throw new TossOutcomeUnknownError("Toss에 닿지 못했습니다", error);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (response.status >= 500) {
    throw new TossOutcomeUnknownError(`Toss ${response.status}`, payload);
  }

  if (!response.ok) {
    const error = (payload ?? {}) as { code?: string; message?: string };
    throw new TossApiError(
      error.code ?? "UNKNOWN",
      error.message ?? "결제를 처리하지 못했어요.",
      response.status,
    );
  }

  // 2xx인데 결제 모양이 아니면 무슨 일이 있었는지 모릅니다. 그대로
  // 돌려주면 이행 도중 TypeError로 끊겨 이행도 보상도 일어나지 않습니다.
  if (!isTossPayment(payload)) {
    throw new TossOutcomeUnknownError("Toss 응답을 알아볼 수 없습니다", payload);
  }

  return payload;
}

/**
 * 결제 승인. 성공하면 이 시점에 실제로 돈이 빠져나갑니다.
 *
 * 멱등 키는 주문번호입니다. 새로고침·탭 두 개로 같은 승인이 동시에
 * 나가면, 두 번째는 서로 다른 오류 대신 "처리 중" 또는 첫 번째와
 * 같은 응답을 받습니다.
 */
export function confirmPayment(params: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossPayment> {
  return tossFetch("/payments/confirm", {
    method: "POST",
    body: params,
    idempotencyKey: params.orderId,
  });
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
 *
 * 멱등 키를 걸지 않습니다. 전액 취소는 두 번 나가도 두 번째가
 * ALREADY_CANCELED_PAYMENT로 끝나므로 겹칠 것이 없고, 키를 고정하면
 * 동시에 들어온 두 번째 보상이 "처리 중"을 받아 실패로 보고되거나,
 * 첫 시도의 실패 응답이 키에 묶여 재시도가 풀리지 않습니다.
 */
export async function cancelPayment(
  paymentKey: string,
  reason: string,
): Promise<void> {
  try {
    await tossFetch(`/payments/${encodeURIComponent(paymentKey)}/cancel`, {
      method: "POST",
      body: { cancelReason: reason },
    });
  } catch (error) {
    if (error instanceof TossApiError && error.code === ALREADY_CANCELED) return;
    throw error;
  }
}

/**
 * 주문번호. Toss 규칙은 영문·숫자·`-`·`_` 6~64자입니다.
 *
 * `Math.random()`으로는 길이도 엔트로피도 보장되지 않습니다.
 */
export function generateOrderId(bookId: string): string {
  const random = crypto.randomUUID().replace(/-/g, "");
  return `PB_${bookId.replace(/-/g, "").substring(0, 8)}_${random}`;
}
