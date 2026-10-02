import { NextRequest } from "next/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { generateOrderId } from "@/lib/toss-payments";
import { createPaymentRequest } from "@/lib/payments/server";

/**
 * 결제 요청 — 결제창을 열기 전에 주문을 만듭니다.
 *
 * 결제 행은 서버 RPC로만 만듭니다(마이그레이션 00005). 금액은 RPC가
 * `books.price`에서 정하므로 클라이언트가 보낼 것은 책 ID뿐입니다.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  let body: { bookId?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  const { bookId } = body;
  if (typeof bookId !== "string" || !bookId) {
    return apiError("bookId is required", "VALIDATION_ERROR", 400);
  }

  const orderId = generateOrderId(bookId);

  let result;
  try {
    result = await createPaymentRequest(user.id, bookId, orderId);
  } catch (error) {
    console.error("[payments] 결제 요청을 만들지 못했습니다", { bookId, error });
    return apiError("결제를 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }

  switch (result.outcome) {
    case "created":
      return apiSuccess({
        orderId,
        amount: result.amount,
        orderName: result.title,
        transactionId: result.transactionId,
      });
    case "not_found":
      return apiError("Book not found", "NOT_FOUND", 404);
    case "own_book":
      return apiError("내가 쓴 책은 구매할 수 없어요", "VALIDATION_ERROR", 400);
    case "not_for_sale":
      return apiError("지금은 구매할 수 없는 책이에요", "VALIDATION_ERROR", 400);
    case "free":
      return apiError("무료 책이라 결제하지 않아도 돼요", "VALIDATION_ERROR", 400);
    case "already_owned":
      return apiError("이미 구매한 책이에요", "VALIDATION_ERROR", 400);
  }
}
