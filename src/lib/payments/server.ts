import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelPayment,
  getPaymentByOrderId,
  type TossPayment,
} from "@/lib/toss-payments";
import type { PaymentTransactionStatus } from "@/types";
import type { FulfillArgs, FulfillmentPorts } from "./fulfillment";

/**
 * 이행 절차가 실제로 쓰는 포트.
 *
 * admin 클라이언트를 쓰는 이유는 두 가지입니다. webhook에는 세션이
 * 없고, 구매 기록은 RLS상 아무도 직접 만들 수 없기 때문입니다
 * (마이그레이션 00003에서 INSERT 정책을 없앴습니다).
 *
 * **누구의 결제인지는 세션이 아니라 결제 행이 정합니다.** 이행은
 * `toss_order_id`로 행을 찾고 그 행의 `user_id`에게 책을 엽니다.
 * 호출자가 사용자를 넘기지 않으므로, admin 권한으로 남의 구매를
 * 만들 여지가 없습니다.
 */
export function serverFulfillmentPorts(): FulfillmentPorts {
  const supabase = createAdminClient();

  return {
    async fulfill(args: FulfillArgs): Promise<unknown> {
      const { data, error } = await supabase.rpc("fulfill_payment", {
        p_order_id: args.orderId,
        p_payment_key: args.paymentKey,
        p_amount: args.amount,
        p_method: args.method,
        p_raw: args.raw,
      });

      if (error) throw new Error(`fulfill_payment: ${error.message}`);
      // 모양 검증은 fulfillment.ts의 parseFulfillRpcResult가 합니다.
      return data;
    },

    async markVoided(
      orderId: string,
      status: PaymentTransactionStatus,
      raw: unknown,
    ): Promise<void> {
      // raw가 없을 때 p_raw를 함께 보내면 JSON의 null이 실려 가서
      // 이미 저장된 승인 응답을 덮습니다. 아예 빼면 기본값이 걸립니다.
      const { error } = await supabase.rpc("void_payment", {
        p_order_id: orderId,
        p_status: status,
        ...(raw == null ? {} : { p_raw: raw }),
      });

      if (error) throw new Error(`void_payment: ${error.message}`);
    },

    async cancel(payment: TossPayment, reason: string): Promise<void> {
      try {
        await cancelPayment(payment.paymentKey, reason);
      } catch (error) {
        // 결과를 모르거나, 동시에 들어온 다른 보상(confirm과 webhook)이
        // 먼저 취소했을 수 있습니다. 실제 상태를 다시 물어 이미 취소된
        // 결제면 성공으로 봅니다. 여기서 실패로 끝내면 환불된 결제가
        // stranded로 보고됩니다.
        const current = await getPaymentByOrderId(payment.orderId).catch(
          () => null,
        );
        if (
          current?.paymentKey === payment.paymentKey &&
          current.status === "CANCELED"
        ) {
          return;
        }
        throw error;
      }
    },

    report(message: string, detail: unknown): void {
      // 결제 사고는 응답 본문에 담을 수 없습니다 (독자에게 보여 줄
      // 내용이 아니고, 애초에 응답이 못 나가는 경우도 있습니다).
      // 남길 곳은 서버 로그뿐입니다.
      console.error(`[payments] ${message}`, detail);
    },
  };
}

/**
 * 이 주문의 결제 행이 우리 DB에 있는가.
 *
 * webhook 주소는 누구나 부를 수 있고, 같은 Toss 상점의 다른 환경
 * 주문도 들어옵니다. 조회가 실패하면 던집니다 — "없음"으로 보면
 * 진짜 결제의 webhook을 버리게 됩니다.
 */
export async function paymentTransactionExists(orderId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("toss_order_id", orderId)
    .maybeSingle();

  if (error) throw new Error(`payment_transactions: ${error.message}`);
  return data !== null;
}

export type PaymentRequestResult =
  | { outcome: "created"; transactionId: string; amount: number; title: string }
  | {
      outcome: "not_found" | "own_book" | "not_for_sale" | "free" | "already_owned";
    };

const REFUSALS = new Set([
  "not_found",
  "own_book",
  "not_for_sale",
  "free",
  "already_owned",
]);

/**
 * 결제 요청 행을 만듭니다 — `create_payment_request` RPC (마이그레이션 00005).
 *
 * 결제 행은 이 경로로만 생깁니다. 금액은 RPC가 `books.price`에서
 * 정하고, 팔 수 있는 책인지도 같은 트랜잭션에서 봅니다. 클라이언트가
 * 행을 직접 넣을 수 있던 때는 금액을 위조해 싸게 결제할 수 있었습니다.
 *
 * `userId`는 반드시 세션에서 꺼낸 값을 넘기세요.
 */
export async function createPaymentRequest(
  userId: string,
  bookId: string,
  orderId: string,
): Promise<PaymentRequestResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("create_payment_request", {
    p_user_id: userId,
    p_book_id: bookId,
    p_order_id: orderId,
  });

  if (error) throw new Error(`create_payment_request: ${error.message}`);

  const row = (data ?? {}) as Record<string, unknown>;
  if (
    row.outcome === "created" &&
    typeof row.transaction_id === "string" &&
    typeof row.amount === "number" &&
    typeof row.title === "string"
  ) {
    return {
      outcome: "created",
      transactionId: row.transaction_id,
      amount: row.amount,
      title: row.title,
    };
  }
  if (typeof row.outcome === "string" && REFUSALS.has(row.outcome)) {
    return { outcome: row.outcome as Exclude<PaymentRequestResult["outcome"], "created"> };
  }

  throw new Error(`create_payment_request: 알 수 없는 결과 ${JSON.stringify(data)}`);
}
