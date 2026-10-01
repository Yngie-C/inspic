import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import {
  ALREADY_PROCESSED,
  TossApiError,
  confirmPayment,
  getPaymentByOrderId,
  type TossPayment,
} from "@/lib/toss-payments";
import { fulfillApprovedPayment } from "@/lib/payments/fulfillment";
import { serverFulfillmentPorts } from "@/lib/payments/server";
import { paymentPhase } from "@/lib/payments/status";

/**
 * 결제 승인.
 *
 * 이 라우트가 지켜야 하는 것은 하나입니다. **여기를 몇 번 부르든
 * 구매는 한 번, 그리고 돈이 나갔으면 책이 열리거나 돈이 돌아온다.**
 *
 * 독자는 이 요청을 자주 두 번 이상 보냅니다 — 성공 화면 새로고침,
 * 느린 응답에 지쳐 뒤로 갔다 다시 오기, webhook과의 겹침. 예전
 * 구현은 두 번째 호출에서 Toss가 내는 ALREADY_PROCESSED_PAYMENT를
 * 승인 실패로 보고 멀쩡히 끝난 결제를 `aborted`로 덮었습니다.
 *
 * 권한 판정은 세션으로, 쓰기는 admin으로 나눠서 합니다. 결제 행을
 * 세션 클라이언트로 읽는 것 자체가 소유 확인입니다 (RLS상 자기
 * 결제만 보입니다). 이행은 구매 기록을 만들어야 하는데, 그 권한은
 * 이제 아무 클라이언트에도 없습니다 (마이그레이션 00003).
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  let body: { paymentKey?: string; orderId?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  const { paymentKey, orderId, amount } = body;
  if (!paymentKey || !orderId || typeof amount !== "number") {
    return apiError(
      "paymentKey, orderId, amount are required",
      "VALIDATION_ERROR",
      400,
    );
  }

  const supabase = await createClient();

  // RLS상 자기 결제만 보입니다. 못 찾았다는 것은 없거나 남의 것이라는
  // 뜻이고, 둘을 구분해 알려 줄 이유가 없습니다.
  const { data: transaction } = await supabase
    .from("payment_transactions")
    .select("id, book_id, amount, status, purchase_id")
    .eq("toss_order_id", orderId)
    .eq("user_id", user.id)
    .single();

  if (!transaction) {
    return apiError("결제 정보를 찾을 수 없어요", "NOT_FOUND", 404);
  }

  // 이미 이행이 끝난 주문. Toss를 다시 부르지 않고 그대로 돌려줍니다.
  // 새로고침이 가장 흔한 경로이고, 여기서 승인을 재시도할 이유가 없습니다.
  //
  // `status`를 함께 보는 이유는 환불입니다. 취소된 결제도 purchase_id는
  // 그대로 달고 있으므로, 그것만 보면 이미 닫힌 책을 "구매 완료"로
  // 안내하고 독자는 열리지 않는 리더로 갑니다.
  if (transaction.purchase_id && transaction.status === "done") {
    return apiSuccess({
      purchaseId: transaction.purchase_id,
      bookId: transaction.book_id,
      status: "completed",
    });
  }

  if (transaction.amount !== amount) {
    return apiError("결제 금액이 주문 금액과 달라요. 결제 화면에서 다시 시도해 주세요.", "VALIDATION_ERROR", 400);
  }

  const ports = serverFulfillmentPorts();

  let payment: TossPayment;
  try {
    payment = await approve({ paymentKey, orderId, amount: transaction.amount });
  } catch (error) {
    const failure = describeFailure(error);

    // 승인이 안 된 결제는 되돌릴 것이 없습니다 — 돈이 나가지
    // 않았습니다. 결제 행만 `aborted`로 남겨 다음 요청이 같은 길을
    // 또 가지 않게 합니다.
    try {
      await ports.markVoided(orderId, "aborted", null);
    } catch (voidError) {
      ports.report("승인 실패를 결제 행에 남기지 못했습니다", {
        orderId,
        voidError,
      });
    }

    return apiError(failure.message, "SERVER_ERROR", failure.httpStatus);
  }

  const result = await fulfillApprovedPayment(ports, payment);

  switch (result.kind) {
    case "granted":
    case "already":
      return apiSuccess({
        purchaseId: result.purchaseId,
        bookId: result.bookId,
        status: "completed",
      });

    // 결제는 취소됐고 독자는 손해를 보지 않았습니다. 200으로 돌려
    // "이미 보유한 책"을 안내합니다 — 붉은 실패 화면을 띄우면 돈이
    // 묶인 줄 알고 다시 결제합니다.
    case "refunded":
      return apiSuccess({
        status: "refunded",
        reason: result.reason,
        bookId: result.bookId ?? transaction.book_id,
      });

    case "stranded":
      return apiError(result.reason, "SERVER_ERROR", 500);
  }
}

/**
 * 승인을 요청하고, 이미 승인된 결제였다면 조회로 대신합니다.
 *
 * ALREADY_PROCESSED_PAYMENT는 실패가 아니라 "네가 아까 승인했다"는
 * 대답입니다. 여기까지 왔다는 것은 승인 뒤 이행이 끝나지 않았다는
 * 뜻이므로, 결제를 다시 읽어 이행을 이어 가야 합니다.
 */
async function approve(params: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossPayment> {
  try {
    return await confirmPayment(params);
  } catch (error) {
    if (!(error instanceof TossApiError) || error.code !== ALREADY_PROCESSED) {
      throw error;
    }

    const payment = await getPaymentByOrderId(params.orderId);
    if (paymentPhase(payment.status) !== "settled") {
      // 승인은 지났는데 지금은 승인 상태가 아니다 — 취소·만료된
      // 결제입니다. 이행하면 안 됩니다.
      throw new TossApiError(
        payment.status,
        "이미 취소됐거나 만료된 결제예요.",
        400,
      );
    }
    return payment;
  }
}

function describeFailure(error: unknown): {
  message: string;
  httpStatus: number;
} {
  if (error instanceof TossApiError) {
    return {
      // Toss의 거절 사유는 독자가 다음에 무엇을 할지 정하는 데 필요한
      // 정보입니다 (한도 초과인지, 카드사 거절인지).
      message: error.message,
      // Toss가 거절한 것은 우리 서버의 오류가 아닙니다. 4xx로 내려야
      // 클라이언트가 "잠시 후 다시"로 오해하지 않습니다.
      httpStatus: error.httpStatus >= 400 && error.httpStatus < 500 ? 400 : 502,
    };
  }

  return { message: "결제를 승인하지 못했어요. 잠시 뒤 다시 시도해 주세요.", httpStatus: 502 };
}
