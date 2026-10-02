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

### WP1. 즉시 수정 — 작고 피해가 큰 것
| 지적 | 수정 |
|---|---|
| 4-P0-1 | `BaseTemplateNode.ts` `renderHTML`에서 content hole `0` 제거 |
| 4-P0-4 | 챕터 POST/PUT에서 `content_html` 길이(500000)를 DB 전에 검사해 한국어 400. `EditPageContent.saveChapter`가 `res.ok`를 보고 실패를 표시 |
| 3-P0-2 | `responses/route.ts` `loadFieldDefinitions`의 조회 에러면 500 (블록 조회도 같이) |
- 테스트: 에디터에 블록 삽입 → `getHTML()` 성공, 챕터 길이 초과 → 400, 정의 조회 실패 → 500.

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
| 0 | 준비·P0-1 재현 | – |  |  |  |
| 1 | 즉시 수정 | – |  |  |  |
| 2 | 결제 무결성 | 00005 |  |  |  |
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
