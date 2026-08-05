import { createAdminClient } from "@/lib/supabase/admin";
import { cancelPayment } from "@/lib/toss-payments";
import type { PaymentTransactionStatus } from "@/types";
import type {
  FulfillArgs,
  FulfillRpcResult,
  FulfillmentPorts,
} from "./fulfillment";

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
    async fulfill(args: FulfillArgs): Promise<FulfillRpcResult> {
      const { data, error } = await supabase.rpc("fulfill_payment", {
        p_order_id: args.orderId,
        p_payment_key: args.paymentKey,
        p_amount: args.amount,
        p_method: args.method,
        p_raw: args.raw,
      });

      if (error) throw new Error(`fulfill_payment: ${error.message}`);
      if (!data) throw new Error("fulfill_payment: 빈 응답");

      return data as FulfillRpcResult;
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

    cancel(paymentKey: string, reason: string): Promise<void> {
      return cancelPayment(paymentKey, reason, paymentKey);
    },

    report(message: string, detail: unknown): void {
      // 결제 사고는 응답 본문에 담을 수 없습니다 (독자에게 보여 줄
      // 내용이 아니고, 애초에 응답이 못 나가는 경우도 있습니다).
      // 남길 곳은 서버 로그뿐입니다.
      console.error(`[payments] ${message}`, detail);
    },
  };
}
