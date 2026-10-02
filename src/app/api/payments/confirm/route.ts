import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import {
  ALREADY_PROCESSED,
  TossApiError,
  confirmPayment,
  getPaymentByOrderId,
  isOutcomeUnknown,
  isTossConfigError,
  type TossPayment,
} from "@/lib/toss-payments";
import {
  reconcilePayment,
  type FulfillmentPorts,
} from "@/lib/payments/fulfillment";
import { serverFulfillmentPorts } from "@/lib/payments/server";
import { paymentPhase } from "@/lib/payments/status";
import type { PaymentTransactionStatus } from "@/types";

/**
 * 결제 승인.
 *
 * 이 라우트가 지켜야 하는 것은 하나입니다. **여기를 몇 번 부르든
 * 구매는 한 번, 그리고 돈이 나갔으면 책이 열리거나 돈이 돌아온다.**
 *
 * 독자는 이 요청을 자주 두 번 이상 보냅니다 — 성공 화면 새로고침,
 * 느린 응답에 지쳐 뒤로 갔다 다시 오기, webhook과의 겹침.
 *
 * **승인이 실패했다고 단정하는 것은 Toss가 분명히 거절했을 때뿐입니다.**
 * 네트워크 오류·시간 초과·Toss 5xx·"처리 중"은 승인됐을 수도 있다는
 * 뜻이므로, 결제를 다시 조회해 그 상태를 따릅니다. 예전 구현은 모든
 * 실패를 `aborted`로 덮어, 이미 취소·만료된 결제의 기록을 지우고
 * 연결된 구매까지 닫았습니다.
 *
 * 권한 판정은 세션으로, 쓰기는 admin으로 나눠서 합니다. 결제 행을
 * 세션 클라이언트로 읽는 것 자체가 소유 확인입니다 (RLS상 자기
 * 결제만 보입니다).
 *
 * 응답의 `status`:
 *   completed   책이 열렸습니다
 *   refunded    열지 못해(또는 이미 취소돼) 결제가 취소됐습니다
 *   processing  결과를 아직 모릅니다 (202). webhook이 마무리합니다
 */

const PROCESSING_MESSAGE =
  "결제 결과를 아직 확인하는 중이에요. 승인됐다면 잠시 뒤 내 서재에 책이 들어와요.";
const CANCELED_MESSAGE = "이미 취소된 결제예요. 결제한 금액은 돌려드렸어요.";
const NOT_APPROVED_MESSAGE =
  "승인되지 않고 끝난 결제예요. 다시 결제하려면 책 화면에서 시작해 주세요.";

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  let body: { paymentKey?: unknown; orderId?: unknown; amount?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  const { paymentKey, orderId, amount } = body;
  if (
    typeof paymentKey !== "string" ||
    !paymentKey ||
    typeof orderId !== "string" ||
    !orderId ||
    typeof amount !== "number" ||
    !Number.isInteger(amount)
  ) {
    return apiError(
      "paymentKey, orderId, amount are required",
      "VALIDATION_ERROR",
      400,
    );
  }

  const supabase = await createClient();

  // RLS상 자기 결제만 보입니다. 못 찾았다는 것은 없거나 남의 것이라는
  // 뜻이고, 둘을 구분해 알려 줄 이유가 없습니다.
  const { data: transaction, error: txError } = await supabase
    .from("payment_transactions")
    .select("id, book_id, amount, status, purchase_id")
    .eq("toss_order_id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (txError) {
    // DB 장애를 "결제 정보를 찾을 수 없어요"로 내면 독자는 결제가
    // 사라진 줄 압니다.
    console.error("[payments] 결제 행을 읽지 못했습니다", { orderId, txError });
    return apiError("결제 정보를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }
  if (!transaction) {
    return apiError("결제 정보를 찾을 수 없어요", "NOT_FOUND", 404);
  }

  // 이미 끝난 주문. Toss를 다시 부르지 않고 그대로 돌려줍니다.
  // 새로고침이 가장 흔한 경로이고, 여기서 승인을 재시도할 이유가 없습니다.
  const settled = settledResponse(
    transaction.status as PaymentTransactionStatus,
    transaction.purchase_id,
    transaction.book_id,
  );
  if (settled) return settled;

  if (transaction.amount !== amount) {
    return apiError("결제 금액이 주문 금액과 달라요. 결제 화면에서 다시 시도해 주세요.", "VALIDATION_ERROR", 400);
  }

  const ports = serverFulfillmentPorts();

  let payment: TossPayment;
  try {
    payment = await confirmPayment({ paymentKey, orderId, amount: transaction.amount });
  } catch (error) {
    const recovered = await recoverFromConfirmError(ports, orderId, error);
    if ("response" in recovered) return recovered.response;
    payment = recovered.payment;
  }

  let result;
  try {
    result = await reconcilePayment(ports, payment);
  } catch (error) {
    // 취소 상태를 결제 행에 남기다 실패했습니다. webhook이 다시 맞춥니다.
    ports.report("결제 상태를 반영하지 못했습니다", { orderId, error });
    return processing();
  }

  switch (result.kind) {
    case "granted":
    case "already":
      return completed(result.purchaseId, result.bookId);

    // 결제는 취소됐고 독자는 손해를 보지 않았습니다. 200으로 돌려
    // 안내합니다 — 붉은 실패 화면을 띄우면 돈이 묶인 줄 알고 다시
    // 결제합니다.
    case "refunded":
      return apiSuccess({
        status: "refunded",
        reason: result.reason,
        // 중복 결제일 때만 "바로 읽기"를 띄울 수 있습니다.
        bookId: result.bookId ?? null,
      });

    case "stranded":
      return apiError(result.reason, "SERVER_ERROR", 500);

    case "deferred":
    case "pending":
      return processing();

    case "voided":
      return (
        settledResponse(result.status, null, transaction.book_id) ??
        processing()
      );
  }
}

/**
 * 승인 요청이 실패했을 때 실제로 어떻게 됐는지 알아냅니다.
 *
 * 돌려주는 것은 이어서 반영할 결제, 또는 독자에게 보낼 응답입니다.
 */
async function recoverFromConfirmError(
  ports: FulfillmentPorts,
  orderId: string,
  error: unknown,
): Promise<{ payment: TossPayment } | { response: Response }> {
  if (isTossConfigError(error)) {
    // 우리 키 설정 문제입니다. 독자의 카드 문제로 보여 주면 안 됩니다.
    ports.report("Toss 키 설정 오류로 승인하지 못했습니다", { orderId, error });
    return {
      response: apiError("결제를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500),
    };
  }

  // Toss가 분명히 거절했는가. ALREADY_PROCESSED_PAYMENT는 "네가 아까
  // 승인했다"는 대답이라 거절이 아닙니다.
  const rejection =
    error instanceof TossApiError &&
    !isOutcomeUnknown(error) &&
    error.code !== ALREADY_PROCESSED
      ? error
      : null;

  let current: TossPayment;
  try {
    current = await getPaymentByOrderId(orderId);
  } catch (lookupError) {
    if (rejection) return { response: await markRejected(ports, orderId, rejection) };
    ports.report("승인 결과를 모르고 재조회도 실패했습니다", {
      orderId,
      error,
      lookupError,
    });
    return { response: processing() };
  }

  // 승인됐거나 이미 종결된 결제는 그 상태를 그대로 반영합니다.
  if (paymentPhase(current.status) !== "pending") {
    return { payment: current };
  }

  // 아직 승인 전입니다. Toss가 분명히 거절했다면 이 주문은 끝났고,
  // 결과를 모르는 것이라면 기다립니다.
  if (rejection) return { response: await markRejected(ports, orderId, rejection) };
  return { response: processing() };
}

/**
 * 승인 거절을 결제 행에 남기고 거절 사유를 돌려줍니다.
 *
 * 승인이 안 된 결제는 되돌릴 것이 없습니다. 결제 행만 `aborted`로
 * 남겨 다음 요청이 같은 길을 또 가지 않게 합니다. 이미 승인을 거친
 * 행이면 `void_payment`가 덮지 않습니다.
 */
async function markRejected(
  ports: FulfillmentPorts,
  orderId: string,
  error: TossApiError,
): Promise<Response> {
  try {
    await ports.markVoided(orderId, "aborted", null);
  } catch (voidError) {
    ports.report("승인 실패를 결제 행에 남기지 못했습니다", { orderId, voidError });
  }
  // Toss의 거절 사유는 독자가 다음에 무엇을 할지 정하는 데 필요한
  // 정보입니다 (한도 초과인지, 카드사 거절인지).
  return apiError(error.message, "VALIDATION_ERROR", 400);
}

/** 이미 결론이 난 결제 행이면 그 결론을, 아니면 `null`. */
function settledResponse(
  status: PaymentTransactionStatus,
  purchaseId: string | null,
  bookId: string,
): Response | null {
  switch (status) {
    case "done":
      // done인데 구매가 없으면 이행이 끝나지 않은 것입니다. 이어 갑니다.
      return purchaseId ? completed(purchaseId, bookId) : null;
    case "partial_canceled":
      // 부분 취소는 접근을 유지합니다 (void_payment 참고).
      return purchaseId
        ? completed(purchaseId, bookId)
        : apiSuccess({ status: "refunded", reason: CANCELED_MESSAGE, bookId: null });
    case "canceled":
      return apiSuccess({ status: "refunded", reason: CANCELED_MESSAGE, bookId: null });
    case "aborted":
    case "expired":
      return apiError(NOT_APPROVED_MESSAGE, "VALIDATION_ERROR", 409);
    default:
      return null;
  }
}

function completed(purchaseId: string, bookId: string): Response {
  return apiSuccess({ purchaseId, bookId, status: "completed" });
}

function processing(): Response {
  return apiSuccess({ status: "processing", reason: PROCESSING_MESSAGE }, 202);
}
