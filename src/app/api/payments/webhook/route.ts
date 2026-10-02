import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  NOT_FOUND_PAYMENT,
  TossApiError,
  getPaymentByOrderId,
  isTossConfigError,
} from "@/lib/toss-payments";
import { reconcilePayment } from "@/lib/payments/fulfillment";
import {
  paymentTransactionExists,
  serverFulfillmentPorts,
} from "@/lib/payments/server";

/**
 * Toss 결제 상태 변경 webhook.
 *
 * 성공 화면의 confirm 호출이 유일한 이행 경로면, 독자가 승인 직후
 * 창을 닫거나 네트워크가 끊긴 순간 결제와 구매가 갈라집니다. 그
 * 상태는 아무도 모르게 남습니다 — 독자는 돈이 나갔다는 것만 알고,
 * 우리 DB에는 `ready`인 결제 행 하나만 있습니다.
 *
 * webhook은 그 틈을 메웁니다. 승인이면 이행하고(confirm과 같은
 * 코드), 취소·만료면 열려 있던 구매를 닫습니다.
 *
 * **본문을 믿지 않습니다.** 이 주소는 누구나 부를 수 있으므로,
 * 본문에서 꺼내는 것은 주문번호뿐이고 나머지는 Toss에 직접 물어
 * 확인합니다. 위조한 본문으로는 결제를 만들어 낼 수 없습니다.
 *
 * 응답 코드는 Toss 재시도를 받을지로 정합니다. 다시 와도 결과가
 * 같은 것(모르는 이벤트, 우리에게 없는 주문, Toss에 없는 결제, 아직
 * 결론이 나지 않은 결제)은 2xx로 닫고, 재시도로 풀릴 수 있는 것(DB
 * 장애, 반영 여부를 모름, 우리 설정 오류)만 5xx를 돌려줍니다.
 */
export async function POST(request: NextRequest) {
  const configuredSecret = process.env.TOSS_WEBHOOK_SECRET;
  if (configuredSecret) {
    // 설정했을 때만 겁니다. 위조 방어의 본체는 아래의 Toss 재조회이고,
    // 이것은 모르는 곳에서 오는 요청을 일찍 끊기 위한 것입니다.
    //
    // 쿼리 파라미터도 받는 것은 Toss 개발자센터의 webhook 등록이 URL만
    // 받기 때문입니다. URL은 접근 로그에 남으므로, 헤더를 붙일 수 있는
    // 앞단이 있다면 헤더를 쓰세요.
    const presented =
      request.headers.get("x-inspic-webhook-secret") ??
      request.nextUrl.searchParams.get("secret");
    if (!presented || !secretMatches(presented, configuredSecret)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  let body: { eventType?: string; data?: { orderId?: unknown } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const orderId = body.data?.orderId;
  if (typeof orderId !== "string" || !orderId) {
    // 결제 이벤트가 아니거나 우리가 모르는 모양입니다. 재시도를
    // 받아도 결과가 달라지지 않으므로 200으로 닫습니다.
    return NextResponse.json({ ignored: true });
  }

  const ports = serverFulfillmentPorts();

  try {
    // 우리에게 결제 행이 없는 주문 — 다른 환경(테스트·운영)의 주문이거나
    // 결제 행이 사라진 경우입니다. 이행·취소 RPC는 행이 없으면 던지므로
    // 그대로 두면 매번 5xx로 끝없이 재시도를 받고, 승인 결제라면 이행
    // 실패로 보고 취소까지 했습니다. 남의 결제를 건드리지 않고 닫습니다.
    if (!(await paymentTransactionExists(orderId))) {
      ports.report("결제 행이 없는 주문의 webhook — 무시합니다", { orderId });
      return NextResponse.json({ ignored: "unknown order" });
    }

    // 여기서부터가 사실입니다. 본문의 status나 amount는 쓰지 않습니다.
    const payment = await getPaymentByOrderId(orderId);
    const result = await reconcilePayment(ports, payment);

    if (result.kind === "stranded" || result.kind === "deferred") {
      // 끝내지 못했습니다. 5xx로 돌려 Toss의 재시도를 받습니다 —
      // 일시적인 DB 장애라면 다음 시도에서 풀립니다.
      ports.report("webhook 이행 미완료 — 재시도를 기다립니다", {
        orderId,
        kind: result.kind,
      });
      return NextResponse.json({ error: "not fulfilled" }, { status: 500 });
    }

    return NextResponse.json({ handled: result.kind });
  } catch (error) {
    if (error instanceof TossApiError && error.code === NOT_FOUND_PAYMENT) {
      // Toss에 없는 결제입니다. 공개 주소로 아무 주문번호나 보내는
      // 요청에 5xx로 답하면 재시도와 우리 키로 하는 조회가 불어납니다.
      return NextResponse.json({ ignored: "payment not found" });
    }
    ports.report(
      isTossConfigError(error)
        ? "webhook 처리 실패 — Toss 키 설정을 확인하세요"
        : "webhook 처리 실패",
      { orderId, error },
    );
    return NextResponse.json({ error: "webhook failed" }, { status: 500 });
  }
}

/**
 * 비밀값을 상수 시간에 비교합니다.
 *
 * `!==`는 앞에서부터 다른 글자를 만나는 순간 끝나, 응답 시간으로
 * 값을 한 글자씩 맞춰 볼 수 있습니다. 길이가 다르면 `timingSafeEqual`이
 * 던지므로 둘 다 해시해 길이를 맞춥니다.
 */
function secretMatches(presented: string, expected: string): boolean {
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
