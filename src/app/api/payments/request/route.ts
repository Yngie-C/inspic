import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { generateOrderId } from "@/lib/toss-payments";

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  let body: { bookId?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  const { bookId } = body;
  if (!bookId) {
    return apiError("bookId is required", "VALIDATION_ERROR", 400);
  }

  const supabase = await createClient();

  // 책 정보 조회
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, title, price, owner_id, status, visibility")
    .eq("id", bookId)
    .single();

  if (bookError || !book) {
    return apiError("Book not found", "NOT_FOUND", 404);
  }

  // 자기 책 구매 방지
  if (book.owner_id === user.id) {
    return apiError("내가 쓴 책은 구매할 수 없어요", "VALIDATION_ERROR", 400);
  }

  // 미발행/비공개 책 구매 방지
  if (book.status !== "published" || book.visibility !== "public") {
    return apiError("지금은 구매할 수 없는 책이에요", "VALIDATION_ERROR", 400);
  }

  // 무료 책 구매 방지
  if (book.price === 0) {
    return apiError("무료 책이라 결제하지 않아도 돼요", "VALIDATION_ERROR", 400);
  }

  // 이미 구매한 책 중복 방지
  const { data: existing } = await supabase
    .from("purchases")
    .select("id")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .eq("status", "completed")
    .maybeSingle();

  if (existing) {
    return apiError("이미 구매한 책이에요", "VALIDATION_ERROR", 400);
  }

  // orderId 생성 및 트랜잭션 기록
  const orderId = generateOrderId(bookId);

  const { data: transaction, error: txError } = await supabase
    .from("payment_transactions")
    .insert({
      user_id: user.id,
      book_id: bookId,
      toss_order_id: orderId,
      amount: book.price,
      status: "ready",
    })
    .select()
    .single();

  if (txError) {
    return apiError("결제를 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }

  return apiSuccess({
    orderId,
    amount: book.price,
    orderName: book.title,
    transactionId: transaction.id,
  });
}
