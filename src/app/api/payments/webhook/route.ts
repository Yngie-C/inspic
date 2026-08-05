import { NextRequest, NextResponse } from "next/server";
import { getPaymentByOrderId } from "@/lib/toss-payments";
import { reconcilePayment } from "@/lib/payments/fulfillment";
import { serverFulfillmentPorts } from "@/lib/payments/server";

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
 * 처리하지 못한 요청에만 5xx를 돌려줍니다. Toss는 2xx가 아니면
 * 재시도하는데, 우리가 판단해서 넘긴 것(모르는 이벤트, 아직 결론이
 * 나지 않은 결제)까지 재시도를 받으면 같은 요청이 계속 돌아옵니다.
 */
export async function POST(request: NextRequest) {
  const configuredSecret = process.env.TOSS_WEBHOOK_SECRET;
  if (configuredSecret) {
    // 설정했을 때만 겁니다. 위조 방어의 본체는 아래의 Toss 재조회이고,
    // 이것은 모르는 곳에서 오는 요청을 일찍 끊기 위한 것입니다.
    const presented =
      request.headers.get("x-inspic-webhook-secret") ??
      request.nextUrl.searchParams.get("secret");
    if (presented !== configuredSecret) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  let body: { eventType?: string; data?: { orderId?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const orderId = body.data?.orderId;
  if (!orderId) {
    // 결제 이벤트가 아니거나 우리가 모르는 모양입니다. 재시도를
    // 받아도 결과가 달라지지 않으므로 200으로 닫습니다.
    return NextResponse.json({ ignored: true });
  }

  const ports = serverFulfillmentPorts();

  try {
    // 여기서부터가 사실입니다. 본문의 status나 amount는 쓰지 않습니다.
    const payment = await getPaymentByOrderId(orderId);
    const result = await reconcilePayment(ports, payment);

    if (result.kind === "stranded") {
      // 이행도 취소도 못 했습니다. 5xx로 돌려 Toss의 재시도를 받습니다 —
      // 일시적인 DB 장애라면 다음 시도에서 풀립니다.
      ports.report("webhook 이행 실패 — 재시도를 기다립니다", { orderId });
      return NextResponse.json({ error: "not fulfilled" }, { status: 500 });
    }

    return NextResponse.json({ handled: result.kind });
  } catch (error) {
    ports.report("webhook 처리 실패", { orderId, error });
    return NextResponse.json({ error: "webhook failed" }, { status: 500 });
  }
}
