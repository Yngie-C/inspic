# 코드 리뷰 1~4단계 수정 계획

- 작성: 2026-10-02
- 근거: [01-payments-access.md](code-review-results/01-payments-access.md) · [02-db-rls.md](code-review-results/02-db-rls.md) · [03-responses.md](code-review-results/03-responses.md) · [04-block-sync-publish.md](code-review-results/04-block-sync-publish.md)
- 표기: `1-P0-3` = 1단계 결과의 P0-3. 지적 번호는 각 결과 문서를 따라요.

## 왜 지금, 왜 이렇게 묶는가

1~4단계 지적은 근본 원인을 나눠 가져요. 같은 블록 ID 문제가 2·3·4단계에서 네 번, 구매자 접근 문제가 1·2·4단계에서 세 번 나왔어요. 그래서 **단계별이 아니라 근본 원인별로 작업 묶음(WP)을 나누고, 한 WP = 한 PR**로 가요. 5~8단계 리뷰는 이 수정이 끝난 코드 위에서 이어 가요(같은 원인을 다시 지적받지 않도록).

지금은 M6(실사용 검증) 직전이고 결제는 테스트 키예요. 실제 돈이 걸리기 전에 결제 무결성을 닫고, 저자 2~3명이 들어오기 전에 저작 경로의 유실을 닫는 것이 목표예요.

## 확정된 정책 결정 (2026-10-02)

| 결정 | 내용 | 관련 지적 |
|---|---|---|
| 판매된 책 | 구매자는 저자가 비공개·보관해도 계속 열람·응답 저장·내보내기 가능. 구매가 있는 책은 삭제를 거절하고 보관으로 안내. 결제·구매 기록은 책 삭제로 지우지 않음 | 1-P1(접근 `:78`), 2-P1-1, 4-P0-5, 4-P1-15, 1-P1(구매 목록 `:14`) |
| `unlisted` | 화면에서 선택지를 숨김. DB 값은 남겨 두되 새로 고를 수 없게 | 1-P1(`unlisted`) |
| 출간 후 편집 | 본문 저장·반영은 그대로. 편집 화면에 차단 사유를 배너로 계속 표시. 공개본/편집본 분리는 M6 이후 | 4-P1-12 |
| 빈 제목·빈 장 | 빈 제목은 차단, 빈 장은 경고. 검사는 published 챕터만 | 4-P1-24, 4-P1-22 |

정책을 반영하면서 AGENTS.md의 "결제와 접근 제어", "출간 경로" 절을 함께 고쳐요.

## 작업 묶음 (순서대로)

### WP0. 준비 (PR 없음)
- `npm install` 후 기준선 기록: `npm run typecheck`, `npm test`, `npm run lint`(에러 10개), `npm run build`.
- 4-P0-1 재현: 개발 서버에서 워크북 블록을 넣고 `getHTML()`이 던지는지 확인. 결과를 이 문서에 적기.
- 각 WP를 시작할 때 해당 지적의 재현 경로를 먼저 확인하고, 재현되지 않는 지적은 "재현 안 됨"으로 표시하고 건너뜀(리뷰 결과는 모두 2차 검증 전이에요).

#### WP0 결과 (2026-10-02, 커밋 `360f58d` 기준)

기준선 — 앞으로의 WP는 이 수치보다 나빠지면 안 돼요.

| 명령 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm test` | 24 파일 · 358개 통과. 단, 첫 실행에서 `workbook-responses.test.ts`·`workbook-sync.test.ts`가 `beforeAll` 10초 시간 초과로 실패(28 skipped). 단독 실행과 전체 재실행은 모두 통과 → PGlite 하네스 생성이 병렬 부하에서 늦어지는 간헐 실패. 다시 나면 하네스 `hookTimeout`을 늘리는 것을 검토 |
| `npm run lint` | **에러 9개**, 경고 17개 (AGENTS.md의 "10개"보다 하나 적음). 내역: `no-explicit-any` 5, `set-state-in-effect` 3, memoization 보존 실패 1 |
| `npm run build` | 통과 |

4-P0-1 재현 — **재현됨.** 개발 서버 대신 jsdom에서 `RichTextEditor`와 같은 확장(StarterKit + 템플릿 노드 5종)으로 `Editor`를 만들어 확인했어요(로그인·Supabase 없이 같은 코드 경로를 탈 수 있어서).
- 다섯 블록(`checklist`·`callout`·`reflection`·`smart-goal`·`scale`) 모두, 블록이 든 HTML을 불러올 때와 `insertContent`로 넣을 때 둘 다 `getHTML()`이 `RangeError: Content hole not allowed in a leaf node spec`을 던져요. 즉 지금은 워크북 블록이 든 챕터를 저장할 수 없어요.
- `renderHTML`에서 `0`만 빼면 다섯 블록 모두 `data-*` 속성이 보존된 `<section>`으로 직렬화되는 것까지 확인하고 되돌렸어요. WP1에서 이 확인을 정식 테스트로 남겨요.
- 브라우저에서 슬래시 메뉴로 넣는 경로는 WP1 수정 후 개발 서버에서 확인해요.

### WP1. 즉시 수정 — 작고 피해가 큰 것
| 지적 | 수정 |
|---|---|
| 4-P0-1 | `BaseTemplateNode.ts` `renderHTML`에서 content hole `0` 제거 |
| 4-P0-4 | 챕터 POST/PUT에서 `content_html` 길이(500000)를 DB 전에 검사해 한국어 400. `EditPageContent.saveChapter`가 `res.ok`를 보고 실패를 표시 |
| 3-P0-2 | `responses/route.ts` `loadFieldDefinitions`의 조회 에러면 500 (블록 조회도 같이) |
- 테스트: 에디터에 블록 삽입 → `getHTML()` 성공, 챕터 길이 초과 → 400, 정의 조회 실패 → 500.

#### WP1 결과 (2026-10-02)

| 지적 | 상태 | 한 일 |
|---|---|---|
| 4-P0-1 | 수정됨 | `renderHTML`에서 `0` 제거. `BaseTemplateNode.test.ts`가 다섯 블록의 불러오기·삽입·저장 후 재로드를 확인 |
| 4-P0-4 | 수정됨 | `lib/content-stats.ts`에 `MAX_CHAPTER_HTML_LENGTH`·`isChapterHtmlTooLong()`(Postgres `length()`처럼 코드 포인트로 셈). 챕터 POST/PUT이 sanitize 뒤 DB 전에 검사해 400 `CONTENT_TOO_LONG` + 한국어 사유. `saveChapter`가 `res.ok`를 보고 실패 시 "저장 안 됨 · 사유 · 다시 시도"를 띄우며, "검수 후 공개"는 저장이 실패하면 넘어가지 않음. 서버 문구는 `CONTENT_TOO_LONG`일 때만 띄우고 나머지는 일반 문구(DB 원문 노출 방지) |
| 3-P0-2 | 수정됨 | `loadFieldDefinitions`가 조회 에러를 돌려주고 라우트가 500. 블록 조회는 원래 500이었음(테스트로 고정) |

- 테스트: 새 테스트 16개(`BaseTemplateNode.test.ts`, `content-stats.test.ts`, `chapters-route.test.ts`, `responses-route.test.ts`). 라우트 테스트용 가짜 클라이언트는 `src/test/fake-supabase.ts`. 수정을 되돌리면 대조 케이스를 뺀 10개가 실패하는 것을 확인.
- 검증: typecheck 통과, `npm test` 28 파일·374개 통과, lint 에러 9·경고 17(기준선 그대로), build 통과.
- **남은 확인:** 이 worktree에는 `.env.local`이 없어 개발 서버에서 로그인한 화면(슬래시 메뉴로 블록 넣고 저장, 긴 본문 저장 실패 표시)은 보지 못했어요.
- 범위 밖으로 둔 것: 업로드 라우트(`/api/upload`)도 본문 길이를 먼저 보지 않지만, 실패하면 책을 롤백하고 실패를 화면에 내므로 조용한 유실은 아니에요. 붙여 넣은 base64 이미지를 업로드 경로로 돌리는 것은 정하지 않았어요.

### WP2. 결제 무결성 — 마이그레이션 `00005`
- 대상: 1-P0-1 ~ 1-P0-7, 2-P0-1 ~ 2-P0-3, 1-P1 "결제 API·라우트" 전부.
- DB (`00005_payment_fixes.sql`):
  - `payment_transactions` INSERT 정책 제거. 결제 행 생성은 `/api/payments/request`의 서버 경로(RPC, `service_role`)로만, 금액은 서버가 `books.price`에서 정함 (1-P0-6, 2-P0-1).
  - `void_payment`: 이 구매를 마지막으로 이행한 결제일 때만 회수 (1-P0-2, 2-P0-2).
  - `fulfill_payment`: 종결된 결제 행은 이행 거부 (2-P0-3). `already_fulfilled`인데 구매가 `completed`가 아니면 되살리거나 `stranded` (1-P0-3).
  - `service_role` GRANT는 `00003`처럼 롤 존재 확인 후.
- 앱:
  - `toss-payments.ts`: "결과 모름"(네트워크·타임아웃·5xx) 에러 종류 분리, `AbortSignal` 타임아웃, 응답 검증, 승인 Idempotency-Key = `orderId` (1-P0-7).
  - `confirm/route.ts`: 확정 거절만 `aborted`, 결과 모름은 재조회해 그 상태를 따름, 종결 주문은 조기 반환 (1-P0-1).
  - `fulfillment.ts`: `paymentPhase(...) === 'approved'` 검사 (1-P0-5). 이행 예외는 보상하지 않고 webhook 5xx / confirm "처리 중" (1-P0-4).
  - webhook: 행 없는 주문·`NOT_FOUND_PAYMENT`는 2xx로 닫음, secret은 헤더 + `timingSafeEqual`. RPC outcome 검증, 취소 Idempotency 처리, 설정 오류 5xx.
  - 결제 화면 P1(성공·실패·체크아웃 페이지)도 이 PR에서.
- 테스트: `payments.test.ts`(재구매 후 옛 취소, 취소 후 이행 거부, 회수된 구매 재이행), `rls.test.ts`(결제 행 직접 INSERT 차단), 결제 단위 테스트(결과 모름 → 재조회, 일시 오류 → 보상 안 함).
- 수동: 테스트 키로 정상 결제·새로고침 중복 confirm·창 닫기.

#### WP2 결과 (2026-10-02)

| 지적 | 상태 | 한 일 |
|---|---|---|
| 1-P0-6, 2-P0-1 | 수정됨 | `payment_transactions_insert_own` 제거. 결제 행은 `create_payment_request` RPC(`service_role`)로만, 금액은 `books.price`. 팔 수 있는 책인지(공개 발행·유료·자기 책 아님·미보유)도 같은 트랜잭션에서 판정. `/api/payments/request`는 이 RPC만 부름 |
| 1-P0-2, 2-P0-2 | 수정됨 | `purchases.payment_transaction_id`(지금 이 구매를 연 결제) 추가·백필. `void_payment`는 그 결제의 취소일 때만 회수. 옛 결제 행의 `purchase_id`는 남김 |
| 2-P0-3 | 수정됨 | `fulfill_payment`가 `canceled`/`aborted`/`expired`(그리고 구매 없는 `partial_canceled`) 행에 `voided`를 돌려주고 아무것도 바꾸지 않음. 앱은 Toss 취소로 마무리(이미 취소면 `ALREADY_CANCELED` = 성공) |
| 1-P0-3 | 수정됨 | 승인 결제가 가리키는 구매가 닫혀 있으면 `restored`로 되살리고 report |
| 1-P0-1 | 수정됨 | confirm: 확정 거절(4xx)만 `aborted`. 결과 모름·`ALREADY_PROCESSED`·처리 중은 재조회해 그 상태를 따름(취소면 `canceled`로 기록), 그래도 모르면 202 `processing`. 종결 주문은 Toss를 부르지 않고 조기 반환. `void_payment`도 승인을 거친 행을 `aborted`/`expired`로 덮지 않음(`ignored`) |
| 1-P0-4 | 수정됨 | 이행 RPC 예외는 `deferred` — 보상하지 않음. webhook 5xx, confirm 202 |
| 1-P0-5 | 수정됨 | `fulfillApprovedPayment`가 승인 상태가 아니면 `pending`. confirm도 `reconcilePayment`를 거침 |
| 1-P0-7 | 수정됨 | `TossOutcomeUnknownError`(네트워크·타임아웃·5xx·모양이 다른 2xx), `isOutcomeUnknown()`(+409 처리 중·429), `isTossConfigError()`, 10초 `AbortSignal.timeout`, 승인 Idempotency-Key = `orderId` |
| 1-P1 결제 API·라우트 | 수정됨 (`request/route.ts:35` 제외 → WP3) | webhook: 결제 행 없는 주문·`NOT_FOUND_PAYMENT` 2xx, `deferred`/`stranded` 5xx, secret 상수 시간 비교. 취소: 고정 멱등 키 제거, 실패 시 재조회해 이미 `CANCELED`면 성공. RPC 결과는 `parseFulfillRpcResult()`로 알려진 outcome만, 나머지 `stranded`. confirm 행 조회 에러 500 |
| 1-P1 결제 화면 | 수정됨 | 성공: JSON 아닌 응답 처리, `processing` 화면, 환불 시 "바로 읽기"는 서버가 `bookId`를 줄 때(중복 결제)만. 체크아웃: `err.code === "USER_CANCEL"`, 화면 금액과 청구 금액이 다르면 결제창을 열지 않고 새 가격 표시. 실패: 알려진 `code`만 문구로, `failUrl`에 `bookId`를 실어 "다시 시도"가 결제 화면으로 |

- **계획과 다르게 한 것:** webhook secret을 "헤더만"이 아니라 헤더 또는 `?secret=`으로 계속 받아요. Toss 개발자센터는 webhook을 URL로만 등록받아 헤더를 붙일 수 없어서, 헤더만 받으면 secret을 설정하는 순간 모든 webhook이 403이 돼요. 비교는 `timingSafeEqual`로 바꿨고, URL이 로그에 남는 점은 `.env.example`에 적었어요.
- **정한 것:** 승인 시점에 금액을 현재 책 가격과 다시 대조하지 않아요(2-P0-1 "검토"). 행 금액은 이제 서버가 요청 시점의 `books.price`로 정하므로, 다시 대조하면 결제창을 연 사이 가격이 바뀐 정상 결제가 막혀요. 대신 체크아웃 화면이 청구 금액과 화면 금액을 맞춰 봐요.
- 테스트: `payments.test.ts` +16(결제 요청 RPC, 재구매 후 옛 취소, 종결 행 이행 거부, 닫힌 구매 되살리기, 승인 행을 `aborted`로 안 덮기), `rls.test.ts` +3(결제 행 직접 INSERT 차단·자기 행 조회·RPC 실행 차단), `fulfillment.test.ts` 재작성(18), `toss-payments.test.ts` 12, `payments-routes.test.ts` 19(confirm·webhook). 결제 행 픽스처는 `create_payment_request`로 심어요. 라우트 테스트는 수정 전 라우트로 돌리면 19개 중 15개가 실패하는 것을 확인.
- 검증: typecheck 통과, `npm test` 30 파일·429개 통과, lint 에러 9·경고 17(기준선 그대로 — `success/page.tsx`의 기존 `set-state-in-effect`가 수정 중 드러나 함께 고침), build 통과.
- **남은 확인(수동):** 이 worktree에는 `.env.local`이 없어 테스트 키로 정상 결제·새로고침 중복 confirm·창 닫기를 직접 해 보지 못했어요. 배포 전에 마이그레이션 `00005`를 적용해야 `/api/payments/request`가 동작해요(RPC가 없으면 500).

### WP3. 구매자 접근과 노출 — 마이그레이션 `00006`
- 대상: 2-P1-1, 2-P1-2, 1-P1 "접근 제어"·"구매 목록", 4-P0-5, 4-P1-15, 4-P1-19.
- DB: `has_book_access`가 completed 구매를 공개 상태보다 먼저 봄. `chapter-images` 익명 SELECT 정책을 지우거나 소유자로 좁힘(공개 URL은 그대로 동작). 결제·구매의 `book_id` FK를 CASCADE에서 바꿀지(RESTRICT 권장) 이 PR에서 정함.
- 앱:
  - `access-control.ts` `checkBookAccess()`를 SQL과 같은 순서로. 쿼리 에러는 별도 reason. `/api/payments/request`의 접근 재구현을 `checkBookAccess()`로.
  - 책 DELETE: 구매가 있으면 거절(보관 안내), 선행 `chapters` 삭제 제거.
  - 책 PUT: 구매자가 있어도 비공개 전환 허용(정책상 구매자는 계속 열람).
  - `unlisted` 선택지 숨김(`BookMetadataForm.tsx`).
  - `/api/purchases`: 조회 실패 500, 비공개 책도 서재에 표시, 내역은 상태별 조회 분리.
- 미리보기 범위(챕터 하나뿐인 유료 책, 1-P1 `:100`)는 이 PR에서 결정만 하고 문서에 남김.
- 테스트: `rls.test.ts`(비공개 책의 구매자 열람·응답 저장 통과, 비구매자 차단, `chapter-images` 익명 list 차단).

### WP4. 블록 ID 규칙 — 마이그레이션 `00007`
- 대상: 4-P0-2, 4-P0-3, 4-P1-4, 4-P1-5, 4-P1-6, 2-P1-3, 3-P1-9, 3-P1-16, 2-P2(`00002:116`), 4-P2-1, 4-P2-3.
- 규칙(먼저 AGENTS.md에 적음): **원래 문서에 있던 블록은 ID를 유지하고, 붙여넣어 새로 들어온 블록만 새 ID를 받는다(붙여넣기 시점 1회).** 잘라내기·붙여넣기는 ID 유지.
- 에디터: 템플릿 타입 전체를 다루는 플러그인 하나로 합치고, `tr.mapping`으로 기존 노드를 판별. 붙여넣기(`transformPasted` 또는 paste 메타)에서 새 ID. 초기 로드 시 ID 없는 블록에 부여하고 dirty 표시. `generateNodeId`에 `crypto.getRandomValues` 대체 경로. 항목 키(field_key) 중복 분리와 길이 제한.
- DB: `sync_chapter_workbook_blocks`가 다른 챕터·책의 블록과 충돌하면 덮지 않고 결과로 보고. 같은 페이로드 안 중복 id의 문항 섞임 수정. 응답 upsert 충돌 키 검토(3-P1-9).
- 검수: 로더가 `id, chapter_id`를 읽어 챕터 단위 비교, 챕터 사이 중복 id는 차단.
- 테스트: ID 플러그인 단위 테스트(위에 붙여넣기, 다른 문서에서 붙여넣기, 잘라내기, 초기 로드, 보안 컨텍스트 밖), `workbook-sync.test.ts`(충돌 보고, 중복 페이로드).

### WP5. 독자 응답 저장
- 대상: 3-P0-1, 3-P0-3 ~ 3-P0-5, 3-P1-1 ~ 3-P1-8, 3-P1-10 ~ 3-P1-15, 2-P1-4, 2-P1-5, 4-P1-7, 4-P1-8.
- 서버: `parseResponseWrites`는 항목 오류를 `rejected`로(400은 본문이 깨졌을 때만). 정수·범위·공백 정규화(`isAnswered()`와 `workbook_response_stats()` 함께). `bookId` UUID 검사. draft 챕터 블록 쓰기 거절. GET 페이지 나누기.
- DB(`00008` 또는 WP4와 합침): `workbook_responses` 직접 쓰기 정책 봉인 또는 WITH CHECK 강화(2-P1-4), draft 챕터 문항 SELECT 차단(2-P1-5).
- Provider: flush 직렬화, hydrate 병합(진행 중 입력 유지, 캐시의 미전송 표시와 쓴 시각), 4xx면 큐에서 빼고 블록 실패 표시, 200건 분할, keepalive 64KB 분할, `visibilitychange`, 계정 전환 시 이전 큐 보류, 블록 단위 실패 상태.
- 리더 템플릿: ID 없는 블록은 읽기 전용, textarea `maxLength`, `TEMPLATE_REGISTRY`·callout은 `Object.hasOwn`, 척도 min/max는 추출기와 같은 함수로(에디터 4-P1-7도 같이), 높이 자동 조절.
- 테스트: `workbook-responses.test.ts`(섞인 배치 부분 저장, 공백 → null, 범위 밖 거절, draft 거절), Provider 테스트(4xx 후 다음 저장 성공, 동시 flush 순서, 미전송 재전송, 로딩 중 입력 유지). 캐시 키는 프로덕션 함수로 심기.

### WP6. 저작 저장과 챕터 API
- 대상: 4-P1-1 ~ 4-P1-3, 4-P1-9 ~ 4-P1-11, 4-P1-13, 4-P1-14, 4-P1-17, 4-P1-18.
- 에디터 노드: 속성이 없을 때만 기본값(`??`), 체크리스트 `data-items` 없으면 빈 목록, 버린 항목 보존·알림.
- 챕터 API: 새 챕터 기본 `draft`, 입력 검증(제목·타입·`null` 본문), 집계는 published 챕터 기준 SUM/COUNT로 재계산(트리거나 RPC), sync는 저장된 행의 `content_html`로, `order_index`는 서버가 정하고 정렬에 `created_at, id` 추가.
- 책 PUT: 런타임 검증, `cover_image_url`은 Storage 경로만 허용(5단계 `/cover` 리뷰 때 다시 확인).

### WP7. 출간 게이트
- 대상: 4-P1-12, 4-P1-16, 4-P1-20 ~ 4-P1-26, 4-P2-11, 4-P2-12.
- 공개 상태가 되는 모든 전환(published + public)에서 `loadPublishChecks()`. status 단독 출간은 visibility를 함께 설정. 검수와 UPDATE 사이 간격 최소화.
- 검수: published 챕터 0개 차단, 본문 검사는 published 챕터만, 문항(fields)까지 비교, 이미지만 있는 장은 비어 있지 않음, 쿼리 에러는 500, 블록 조회 페이지 나누기, 빈 제목 차단·빈 장 경고.
- 출간 후 편집: 편집 화면에 차단 사유 배너(저장은 막지 않음).
- AGENTS.md "출간 경로" 갱신.
- 테스트: 검수 단위 테스트(draft만 있는 책, 이미지만 있는 장, 문항 미동기화, 쿼리 실패, 공개 전환 경로별).

### 미룸 — 5~8단계 리뷰 뒤
- P2 전부(4-P2-1·4-P2-3은 WP4에서 함께). 영문 에러 문구(4-P2-5)는 WP6에서 손이 닿으면 같이.
- 결정만 남긴 것: 미리보기 범위(1-P1 `:100`), 공개본/편집본 분리.

## 진행 체크리스트

| WP | 내용 | 마이그레이션 | 상태 | PR/커밋 | 비고 |
|---|---|---|---|---|---|
| 0 | 준비·P0-1 재현 | – | 완료 | – | 기준선 기록, 4-P0-1 재현됨 (위 "WP0 결과") |
| 1 | 즉시 수정 | – | 완료 |  | 4-P0-1·4-P0-4·3-P0-2 수정됨. 브라우저 확인 남음 |
| 2 | 결제 무결성 | 00005 | 완료 |  | P0 10건·결제 P1 수정. 테스트 키 수동 확인 남음 |
| 3 | 구매자 접근·노출 | 00006 |  |  |  |
| 4 | 블록 ID 규칙 | 00007 |  |  |  |
| 5 | 독자 응답 저장 | (00008) |  |  |  |
| 6 | 저작 저장·챕터 API | – |  |  |  |
| 7 | 출간 게이트 | – |  |  |  |

WP가 끝나면 이 표와 각 결과 문서의 해당 지적 옆에 "수정됨(커밋)" 또는 "재현 안 됨"을 적어요. 모두 끝나면 `code-review-plan.md`의 5단계로 돌아가요.

## 검증 (모든 WP 공통)

- `npm run typecheck && npm test && npm run lint`(에러 10개 이하), `npm run build`.
- 마이그레이션을 추가하면 하네스가 자동으로 적용하므로 `src/lib/supabase/__tests__/`에 케이스 추가. RLS를 고치면 `rls.test.ts`에 통과·차단 케이스를 함께, `asUser`/`asAnon` 헬퍼로.
- 기존 마이그레이션은 고치지 않고 새 파일로.
- UI가 바뀌는 WP(1, 3, 5, 7)는 개발 서버에서 직접 확인. 결제는 테스트 키로.
- 각 PR 설명에 고친 지적 번호와 재현·확인 방법을 적어요.
