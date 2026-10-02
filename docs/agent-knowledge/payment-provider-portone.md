# 결제사 전환 검토 — Toss → PortOne(NHN KCP)

> **상태: 보류 (2026-10-02).** 당장 진행하지 않습니다. KCP 재심사 여부가 확인되면 다시 엽니다.
> 그때까지 코드와 `AGENTS.md`의 결제 규칙은 Toss 기준 그대로입니다.

## 왜 검토하는가

라이브 결제를 받으려면 PG 계약이 필요합니다. `TODO.md`의 "라이브 계약 트랙"은 Toss 전자결제 심사를 새로 받는 것을 전제로 했습니다.
그런데 같은 사업자로 운영하던 다른 프로젝트에 **PortOne(NHN KCP) 계약이 이미 있고**, 그 프로젝트는 접을 예정입니다.
이 계약의 사이트 도메인을 Inspic으로 바꾸면 새 심사를 거치지 않고 라이브 결제를 열 수 있을지도 모릅니다.

참고: Toss 결제를 아직 확인하지 못한 이유는 `.env.local`에 테스트 키가 비어 있어서입니다. Toss 테스트 키는 가입만 하면 바로 나옵니다. 따라서 테스트가 막혔다는 것은 전환할 이유가 아닙니다. 전환할 이유는 **라이브 계약**입니다.

## 확인된 것

| 항목 | 답 |
|---|---|
| 기존 KCP 계약과 같은 사업자인가 | 예 |
| 기존 프로젝트를 계속 운영하는가 | 아니요, 접을 예정 (도메인을 바꿔도 끊길 결제가 없음) |
| 판매 품목이 디지털 콘텐츠(전자책·워크북)로 바뀌어 재심사가 필요한가 | **미확인** — KCP/PortOne 문의 필요 |

## 문의할 것 (KCP 또는 PortOne 기술지원)

> 안녕하세요. 현재 [기존 서비스 도메인]으로 KCP 계약(상점 ID: ___)을 사용 중인 사업자입니다. 기존 서비스를 종료하고, 같은 사업자로 새 서비스 [새 도메인]에서 결제를 받으려 합니다.
> 1. 새 서비스는 **디지털 콘텐츠(전자책·워크북)를 판매**합니다. 사이트 URL 변경만으로 되는지, 아니면 판매 품목이 바뀌어 재심사나 추가 서류(환불 규정 등)가 필요한지 알려 주세요.
> 2. PortOne V2 **컨펌 프로세스**를 KCP 채널에서 쓸 수 있는지, 쓸 수 있다면 신청 방법을 알려 주세요.
> 3. 계약 변경을 처리하는 동안 연동을 개발할 수 있는 **테스트 채널**을 받을 수 있는지 알려 주세요.

## PortOne V2 문서에서 확인한 것 (2026-10-02)

- **웹훅:** Standard Webhooks 규격으로 서명합니다. 실패하면 최대 5번까지 다시 보내고, 간격은 1·4·16·64·256분으로 늘어납니다. 문서도 본문을 믿지 말고 API로 다시 조회하라고 합니다. 지금의 "webhook 본문을 믿지 않는다" 규칙과 같습니다.
- **컨펌 프로세스:** 결제가 승인되기 직전에 PortOne이 `confirmUrl`로 결제 ID·금액을 보내고, 우리 서버가 승인 여부를 답합니다. 기본 기능이 아니라 기술지원 메일로 상점 ID를 보내 신청해야 합니다. KCP가 지원하는지는 문서에 없습니다.
- **테스트 채널:** KCP 연동 문서에는 안내가 없습니다.

출처: [KCP V2 연동](https://developers.portone.io/opi/ko/integration/pg/v2/kcp-v2) · [컨펌 프로세스](https://developers.portone.io/opi/ko/extra/confirm-process/readme-v2?v=v2) · [웹훅 연동](https://developers.portone.io/opi/ko/integration/webhook/readme-v2?v=v2)

## 전환하면 바뀌는 것

**그대로 쓰는 것.** 결제사와 무관한 설계입니다.
- 이행 RPC 하나(`fulfill_payment`)와 한 트랜잭션 이행
- 멱등성(`already_fulfilled`)
- 결과를 모르면 실패로 단정하지 않기(`deferred`, 202 `processing`)
- webhook은 주문번호만 꺼내고 결제사에 다시 묻기
- 열 수 없으면 결제 취소로 보상하고, 취소까지 실패하면 `stranded`

**바꿔야 하는 것.**
- `src/lib/toss-payments.ts`, `src/lib/payments/status.ts`: PortOne API 클라이언트와 상태 매핑
- `src/app/payments/checkout/[bookId]/page.tsx`, `src/app/payments/fail/page.tsx`: 결제창 SDK
- `src/app/api/payments/confirm/route.ts`, `src/app/api/payments/webhook/route.ts`: 검증 흐름과 Standard Webhooks 서명
- `src/lib/payments/server.ts`, `src/lib/payments/fulfillment.ts`: 결제사 호출 부분
- DB: `payment_transactions.toss_payment_key` / `toss_order_id`와 이를 쓰는 RPC(`00003`·`00005`) → **새 마이그레이션**으로 (기존 마이그레이션은 고치지 않음)
- `AGENTS.md`의 "결제와 접근 제어" 절, `TODO.md`의 테스트 결제·라이브 계약 트랙
- 결제사 연동부를 인터페이스 하나 뒤로 모아 두면 다음 교체 비용이 줄어듭니다

**가장 큰 차이 — 언제 돈이 나가는가.**
Toss는 우리 서버가 승인 API를 부르기 전까지 돈이 나가지 않습니다. PortOne+KCP의 기본 흐름은 결제창에서 이미 승인된 뒤에 서버가 검증합니다. 그래서 설계가 컨펌 프로세스 가능 여부에 따라 갈립니다.

- **쓸 수 있으면:** 승인 직전에 우리 서버가 금액·주문을 검증합니다. 지금 구조에 가깝습니다.
- **쓸 수 없으면:** 금액 불일치·이행 실패·중복 결제 등 모든 실패가 "이미 나간 돈의 즉시 취소"가 됩니다. 지금 보상 경로로 감당할 수 있지만, 경로마다 다시 점검해야 합니다.

## 다시 열 때 순서

1. 문의 답변 확인: 재심사 여부, 컨펌 프로세스 가능 여부, 테스트 채널
2. 기존 프로젝트의 PortOne 연동 코드를 확인: V1인지 V2인지, 상점 ID·채널 구성
3. 결제사 교체를 별도 작업으로 계획: 위 "바꿔야 하는 것" 기준
4. 결정되면 `TODO.md`의 라이브 계약 트랙과 `AGENTS.md` 결제 절을 함께 고침
