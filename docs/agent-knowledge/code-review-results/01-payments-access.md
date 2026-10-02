# 1단계 리뷰 결과 — 결제와 접근 제어

- 날짜: 2026-10-01
- 실행: `/code-review high` × 6 (`src/lib/payments`, `src/app/api/payments`, `src/lib/access-control.ts`, `src/lib/toss-payments.ts`, `src/app/api/purchases`, `src/app/payments`)
- 대상 커밋: `43de35a` (모든 경로가 `main`과 diff가 없어 파일 전체를 검토)
- 원본 지적 56건 → 중복을 합쳐 아래 항목으로 정리했어요.
- **2차 검증(verify)을 거치지 않은 지적이에요.** 고치기 전에 코드와 대조해 재현 경로를 먼저 확인하세요.

계획은 [code-review-plan.md](../code-review-plan.md)를 보세요.

## 수정 우선순위

1. **P0-1, P0-2를 먼저.** 다섯 리뷰가 따로따로 같은 원인을 가리켰어요. 이 둘을 고치면 P0-3~P0-6의 상당수가 함께 풀려요.
2. 그다음 P0-3~P0-6 (돈은 나갔는데 책이 안 열리거나, 정상 결제가 환불되는 경로).
3. P1 (접근 판정, 오류 삼키기, 보안 보조 수단).
4. P2 (정리·효율). 급하지 않아요.

---

## P0 — 돈이 나갔는데 책이 닫히거나, 정상 결제가 취소됨

### P0-1. confirm이 승인 단계의 모든 실패를 `aborted`로 덮음
- 위치: `src/app/api/payments/confirm/route.ts:96` (catch), `:72` (조기 반환 조건), `:153-156` (ALREADY_PROCESSED 재조회)
- 무엇: 승인 실패라면 이유를 가리지 않고 `markVoided(orderId, 'aborted')`를 불러요. 조기 반환은 `status === 'done'`일 때만 걸려요.
- 이 경로를 타는 경우:
  - 새로고침·StrictMode·탭 두 개로 confirm이 동시에 두 번 들어가 두 번째가 Toss 처리 중 오류를 받음
  - 승인은 됐는데 응답이 오다 끊김(타임아웃, Toss 5xx)
  - 이미 `canceled`/`partial_canceled`/`expired`인 주문의 성공 URL을 다시 엶 → ALREADY_PROCESSED → 재조회 상태가 voided → throw
- 결과: 실제 상태(`canceled`, `expired`, `partial_canceled`)가 `aborted`로 덮이고, `void_payment`가 연결된 구매를 `refunded`로 바꿔요(P0-2). 부분 취소로 일부러 남긴 접근권도 회수돼요.
- 고칠 방향: 확정 거절(4xx 중 결제 거절 코드)만 `aborted`. 결과를 모르는 실패는 `getPaymentByOrderId`로 다시 조회해 그 상태를 따름. 이미 종결된 주문(`canceled`/`partial_canceled`/`expired`/`aborted`)은 조기 반환. voided 상태는 `transactionStatus(payment.status)`로 기록.
- 2026-10-02 WP2: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP2). 확정 거절(4xx)만 `aborted`, 결과 모름·ALREADY_PROCESSED는 재조회해 그 상태를 따름, 종결 주문은 조기 반환.

### P0-2. `void_payment`가 구매가 지금 어느 결제에 묶여 있는지 보지 않음
- 위치: `supabase/migrations/00003_payment_integrity.sql`의 `void_payment` (호출부 `src/app/api/payments/webhook/route.ts:57`)
- 무엇: `tx.purchase_id`만 보고 구매를 `refunded`로 바꿔요. 재구매는 `UNIQUE(user_id, book_id)` 때문에 같은 purchases 행을 되살려요.
- 시나리오: tx1 구매 → 환불 → tx2로 재구매(같은 P가 completed) → tx1의 취소 webhook이 재시도로 다시 옴, 또는 tx1 성공 URL 재방문(P0-1) → P가 `refunded`. 재구매한 책이 닫혀요.
- 고칠 방향: 새 마이그레이션에서 "이 구매를 마지막으로 이행한 tx가 이 tx일 때만 회수"하도록. `rls.test.ts`/`payments.test.ts`에 재구매 후 옛 tx 취소 케이스 추가.
- 2026-10-02 WP2: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP2). `purchases.payment_transaction_id`로 마지막 이행 결제만 회수.

### P0-3. 회수된 구매가 다시 열리지 않음
- 위치: `src/lib/payments/fulfillment.ts:107`, `fulfill_payment` RPC
- 무엇: `tx.purchase_id`가 있으면 구매가 `refunded`여도 `already_fulfilled`를 돌려주고, 호출부는 성공(`already`)으로 처리해요.
- 결과: Toss는 DONE인데 책은 닫힌 상태가 영구히 남고, 재confirm·webhook 재전송 모두 200 성공으로 끝나요. 아무도 모름.
- 고칠 방향: `already_fulfilled`일 때 구매 상태가 `completed`인지 확인하고, 아니면 되살리거나 `stranded`로 보고.
- 2026-10-02 WP2: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP2). `fulfill_payment`가 닫힌 구매를 `restored`로 되살리고 사람에게 알림.

### P0-4. 이행 RPC의 일시 오류가 곧바로 결제 취소로 이어짐
- 위치: `src/lib/payments/fulfillment.ts:93`
- 무엇: `ports.fulfill`이 던지면 이유를 가리지 않고 Toss 취소(보상)를 실행해요. webhook 주석(`webhook/route.ts:59-63`)이 기대하는 "5xx → Toss 재시도로 풀림"이 일어나지 않아요.
- 결과: DB가 잠깐 끊기면 정상 결제가 환불되고 독자는 다시 결제해야 해요. RPC가 커밋된 뒤 응답만 잃었다면 열린 책도 닫혀요.
- 고칠 방향: 확정 실패(정의된 outcome)만 보상. 예외는 webhook에서는 5xx로 재시도, confirm에서는 "처리 중"으로 안내하고 webhook에 맡김.
- 2026-10-02 WP2: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP2). RPC 예외는 `deferred`(보상 안 함). webhook 5xx, confirm 202 처리 중.

### P0-5. 승인 상태를 확인하지 않고 이행함
- 위치: `src/lib/payments/fulfillment.ts:73`, confirm의 `confirmPayment` 직접 성공 경로
- 무엇: confirm 응답이 `WAITING_FOR_DEPOSIT`/`IN_PROGRESS`여도 이행해요. `method: 'CARD'` 제한은 브라우저에만 있어요.
- 고칠 방향: `fulfillApprovedPayment` 안에서 `paymentPhase(payment.status) === 'approved'`를 검사.
- 2026-10-02 WP2: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP2). `fulfillApprovedPayment`가 승인 상태가 아니면 `pending`.

### P0-6. 결제 행을 클라이언트가 직접 INSERT할 수 있음 (금액 위조)
- 위치: `00001`의 `payment_transactions_insert_own` 정책, `confirm/route.ts:80`
- 무엇: 정책이 `auth.uid() = user_id`만 봐요. confirm은 클라이언트 금액을 결제 행 금액과만 비교하고, 책 가격·공개 상태·소유자는 다시 보지 않아요.
- 시나리오: 3만원 책에 `amount: 100`인 행을 직접 INSERT → Toss로 100원 결제 → confirm 통과 → 구매 생성. 비공개·미발행 책도 같은 방식으로 열려요.
- 고칠 방향: 새 마이그레이션으로 INSERT 정책 제거(`purchases`와 같은 방식으로 봉인), 결제 행 생성은 `/api/payments/request`의 서버 경로(service_role 또는 RPC)로만. `rls.test.ts`에 차단 케이스.
- 비고: 2단계(DB·RLS) 리뷰 범위와 겹쳐요. 거기서도 다시 확인하세요.
- 2026-10-02 WP2: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP2). INSERT 정책 제거, `create_payment_request` RPC가 `books.price`로 생성.

### P0-7. Toss 호출이 "결과 모름"과 "확정 거절"을 구분하지 않음
- 위치: `src/lib/toss-payments.ts:64` (`tossFetch`), `:81`, `:85`
- 무엇:
  - 네트워크 오류·타임아웃·5xx를 4xx 거절과 똑같이 던져요 → P0-1의 원인.
  - fetch에 타임아웃(AbortSignal)이 없어 Toss가 멈추면 함수 제한 시간까지 멈추고, 보상·`stranded` 보고 모두 실행되지 않아요.
  - 2xx 본문이 JSON이 아니면 `null`을 `TossPayment`로 캐스팅해 돌려줘요 → 이행 중 TypeError → 이행도 보상도 없음.
  - 승인 요청에 Idempotency-Key가 없어 동시 승인이 서로 다른 오류를 받아요.
- 고칠 방향: `TossOutcomeUnknownError` 같은 별도 에러 종류, 타임아웃, 응답 검증, 승인 Idempotency-Key로 `orderId` 사용.
- 2026-10-02 WP2: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP2). `TossOutcomeUnknownError` 분리, 10초 타임아웃, 응답 검증, 승인 Idempotency-Key = `orderId`.

## P1 — 접근 판정과 조용한 실패

### 접근 제어 (`src/lib/access-control.ts`)
- **`:78` 공개 상태를 구매보다 먼저 봄.** 저자가 책을 보관·비공개로 돌리면 구매자도 열람·응답 저장·PDF 내보내기를 잃어요. "돈이 나갔으면 책이 열린다"에 어긋나요. → 구매 확인을 공개 판정 앞으로. SQL `has_book_access`도 같이 고쳐야 해요.
- **`:78` `unlisted`가 아무에게도 열리지 않음.** 대시보드는 "링크를 받은 사람만 볼 수 있어요"라고 안내하는데(`BookMetadataForm.tsx:23`), TS와 SQL(`has_book_access`, `is_book_public`) 모두 `public`만 통과시켜요. → 제품 결정 필요: unlisted를 지원할지, 선택지를 숨길지.
- **`:85`, `:67` 쿼리 오류를 버림.** DB 오류 시 구매자가 `preview`/`none`으로 판정돼 결제 유도가 다시 뜨고, 응답 저장은 403이 돼요. → 오류는 던지거나 별도 reason으로.
- **`:100` 미리보기 판정.** 챕터가 하나뿐인 유료 책은 그 챕터가 미리보기로 통째로 무료예요. published 챕터가 없어도 `canRead: true`. → `book_preview_chapter_id()` 정책과 함께 결정.
- **`:61` `userId` 인자와 쿠키 세션 RLS 클라이언트가 어긋날 수 있음.** 호출부가 세션 사용자와 다른 id를 넘기면 판정이 틀려요. → 시그니처에서 userId를 빼거나 문서화.
- **`:61` TS가 SQL `has_book_access`/`is_book_public`을 다시 구현.** 판정이 두 벌이에요. → reason을 돌려주는 RPC 하나로 합치는 것을 검토.

### 결제 API·라우트
- **`webhook/route.ts:57` DB에 행이 없는 주문.** DONE이면 자동 취소, voided면 매번 500으로 무한 재시도. 책 삭제 CASCADE나 다른 환경 주문에서 발생해요. → 행이 없으면 로그 남기고 2xx로 닫기, 취소는 하지 않기. → **수정됨 (WP2)**
- **`toss-payments.ts:99` `NOT_FOUND_PAYMENT`(404)도 500.** 공개 webhook 주소로 아무 orderId나 보내면 Toss 재시도 + 우리 키로 조회 증폭. → 404는 2xx로 닫기. → **수정됨 (WP2)**
- **`webhook/route.ts:32` secret을 쿼리 파라미터로도 받고 `!==`로 비교.** URL이 로그에 남아요. → 헤더만 받고 `timingSafeEqual`. → **수정됨 (WP2)** 헤더 대신 쿼리 파라미터도 계속 받음 — Toss 개발자센터는 URL만 등록받기 때문. 비교는 `timingSafeEqual`.
- **`server.ts:58` 취소 Idempotency-Key가 `paymentKey` 고정.** confirm·webhook이 동시에 보상하면 두 번째가 `IDEMPOTENT_REQUEST_PROCESSING`을 받아 환불됐는데도 `stranded`로 보고돼요. 첫 취소 실패 응답이 키에 묶여 재시도가 안 풀릴 수도 있어요. → `IDEMPOTENT_REQUEST_PROCESSING`/`ALREADY_CANCELED_PAYMENT`를 따로 처리, 시도별 키 검토. → **수정됨 (WP2)**
- **`server.ts:38` RPC 결과를 검증 없이 캐스팅.** 모르는 outcome이 성공(`already`)으로 처리돼요. → 알려진 outcome만 허용하고 나머지는 `stranded`. → **수정됨 (WP2)**
- **`toss-payments.ts:76` 우리 설정 오류(401/403, `UNAUTHORIZED_KEY`)를 독자의 결제 거절로 보여 줌.** → 5xx로 바꾸고 report. → **수정됨 (WP2)**
- **`confirm/route.ts:60` `.single()` 오류를 버림.** DB 장애가 404 "결제 정보를 찾을 수 없어요"로 나가요. → 5xx로 구분. → **수정됨 (WP2)**
- **`request/route.ts:35` 접근 판정 재구현.** AGENTS.md "접근 판정은 `checkBookAccess()` 하나"에 어긋나요. → `checkBookAccess()`의 reason으로 분기.

### 결제 화면 (`src/app/payments`)
- **`success/page.tsx:104` 이행 실패 환불에도 "바로 읽기" 표시.** `duplicate_purchase`일 때만 띄워야 해요. → **수정됨 (WP2)**
- **`success/page.tsx:50` 자동 취소된 결제의 성공 URL 재방문 시 붉은 오류 화면.** P0-1을 고치면 함께 풀려요. 화면도 `refunded` 안내를 보여 줘야 해요. → **수정됨 (WP2)**
- **`success/page.tsx:48` (checkout `:84`, `:88`도) `res.json()`을 상태 확인 전에 호출.** 504 HTML이면 SyntaxError 문구가 그대로 노출되고 독자가 재결제해요. → **수정됨 (WP2)**
- **`checkout/[bookId]/page.tsx:103` 사용자 취소를 `err.message === "USER_CANCEL"`로 판별.** SDK v2는 `err.code`예요. 창을 닫으면 붉은 오류 배너가 떠요. → **수정됨 (WP2)**
- **`checkout/[bookId]/page.tsx:96` 화면 금액(`book.price`)과 실제 청구 금액(`data.amount`)을 비교하지 않음.** 가격이 바뀌면 동의하지 않은 금액이 청구돼요. → **수정됨 (WP2)**
- **`fail/page.tsx:11` URL의 `message`를 그대로 표시.** 사칭 문구를 띄울 수 있어요. 기본 문구가 근거 없이 "돈은 빠져나가지 않았어요"라고 단정해요. → 알려진 code만 문구로 매핑. → **수정됨 (WP2)** "돈은 빠져나가지 않았어요"는 "승인 전에 멈춘 결제라"는 근거를 붙여 남김 — 승인은 성공 화면의 confirm에서만 일어나므로 실패 화면까지 온 결제는 승인 전이에요.
- **`fail/page.tsx:22` "다시 시도"가 `router.back()`.** 모바일 리다이렉트나 새 탭에서는 결제 화면으로 못 돌아가요. → **수정됨 (WP2)**

### 구매 목록 (`src/app/api/purchases/route.ts`)
- **`:23` 조회 실패를 200 + 빈 목록으로.** 결제한 독자에게 "아직 구매한 책이 없어요". → 500으로, 화면의 다시 시도 경로가 동작하게.
- **`:14` 비공개·보관된 책이 RLS로 `books: null`.** 내 서재에서 조용히 사라지고 구매 내역엔 "삭제된 책". 접근 제어 P1(공개 상태보다 구매 먼저)과 함께 결정.
- **`:20` `completed`만 조회.** 구매 내역의 환불·처리 중·실패 배지가 영영 안 떠요. 서재와 내역이 같은 엔드포인트·같은 queryKey를 써서 생긴 문제예요.
- **`:38` `user_profiles` 조회 오류 무시** (로그도 없음).

## P2 — 정리·효율

- `toss-payments.ts:131` `generateOrderId`가 `Math.random()` → 길이·엔트로피 보장 안 됨. `crypto.randomUUID()` 사용. → **수정됨 (WP2)**
- `toss-payments.ts:1` `import "server-only"` 가드 없음.
- `toss-payments.ts:12` `TossPayment.status`가 `string`. `status.ts`와 union 타입 하나로 공유.
- `status.ts:45` `transactionStatus`와 `paymentPhase`가 같은 조회를 두 번, 쓰이지 않는 `'ready'` 폴백. `classify()` 하나로.
- `checkout/[bookId]/page.tsx:77` 결제창을 열었다 닫을 때마다 `ready` 행이 쌓임. 미승인 주문 재사용 검토.
- `checkout/[bookId]/page.tsx:68` 이펙트 의존성이 `user` 객체, 두 조회가 직렬. `user?.id` + `Promise.all`.
- `access-control.ts:65` 호출부가 이미 읽은 books 행을 다시 조회. 클라이언트도 매번 새로 생성.
- `purchases/route.ts:29` owner → display_name 조회가 4개 라우트에 복붙(purchases, explore, landing, my/workbooks). FK 임베드나 `lib/` 헬퍼로.
- `purchases/route.ts:32`, `:49` `as unknown as` 캐스팅으로 타입 검사 꺼짐.
- `purchases/route.ts:8` 요청당 Supabase 클라이언트 2개.
- `purchases/route.ts:13` 쓰지 않는 컬럼(저자 auth id 포함)을 응답에 실음.

## 다음 세션에서 할 일

1. P0-1 + P0-2 수정: confirm catch 분기 재설계, `void_payment` 수정 마이그레이션(00005), `payments.test.ts`에 재구매·동시 confirm·부분 취소 재방문 케이스.
2. P0-3~P0-7 수정.
3. P0-6은 2단계(DB·RLS) 리뷰와 함께 처리해도 돼요.
4. P1의 `unlisted`·미리보기 범위는 제품 결정이 먼저예요.
5. 수정 후 `npm run typecheck && npm test && npm run lint`.
