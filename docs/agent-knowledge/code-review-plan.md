# 코드 리뷰 순차 진행 계획 (중요도 순)

## Context

프로젝트 전체 코드(소스 약 10,800줄 + 마이그레이션 1,070줄)를 일반 `/code-review`(low~max)로 점검하려고 해요. 한 번에 다 넘기면 얕게 훑고 끝나니, **경로 단위로 나눠서 중요도 순으로** 한 세션에 한 묶음씩 돌려요. ultrareview는 과금되므로 이 계획에서는 쓰지 않아요.

중요도 기준은 AGENTS.md가 정한 "조용한 실패"의 무게예요.
1. 돈이 걸린 것 (결제·구매·접근)
2. 데이터가 조용히 새는 것 (RLS)
3. 독자가 쓴 답이 사라지는 것 (응답 쓰기·블록 ID)
4. 보안 입력 경계 (XSS·업로드·리다이렉트)
5. 그 밖의 기능·UI

## 진행 방식

- **한 세션에 한 단계.** 각 단계는 새 세션(`/clear`)에서 아래 명령을 그대로 입력해요.
- **effort**: 1~4단계는 `high`, 5~8단계는 `medium`. 결과가 너무 적거나 의심스러우면 같은 단계를 `max`로 한 번 더 돌려요.
- **같은 단계 안에서 경로가 여러 개면** 명령을 경로마다 따로 실행해요.
- **리뷰와 수정을 나눠요.** 먼저 지적만 받고, 확인한 것만 `--fix` 또는 별도 요청으로 고쳐요. 고친 뒤에는 `npm run typecheck && npm test && npm run lint`를 실행해요 (lint 에러는 기존 10개보다 늘지 않으면 돼요).
- **이미 아는 부채는 제외해요.** 기존 lint 에러 10개(React Compiler)는 리뷰 결과에서 무시해요.
- 각 단계가 끝나면 아래 체크리스트에 날짜와 발견 개수를 적어요.

## 단계

### 1. 결제와 접근 제어 — `high` (약 1,100줄)
돈이 나갔는데 책이 안 열리거나, 돈을 안 냈는데 책이 열리는 문제를 찾아요.
```
/code-review high src/lib/payments
/code-review high src/app/api/payments
/code-review high src/lib/access-control.ts
/code-review high src/lib/toss-payments.ts
/code-review high src/app/api/purchases
/code-review high src/app/payments
```
중점: confirm/webhook이 `fulfillApprovedPayment()` 하나를 쓰는지, `ALREADY_PROCESSED_PAYMENT`·`duplicate_purchase`·`stranded` 처리, 금액을 `payment.totalAmount`로 반영하는지, webhook 본문을 믿지 않는지, `hasAccess`/`canRead`/`canSaveResponses`를 섞어 쓰지 않는지.

### 2. DB 스키마와 RLS — `high` (약 1,070줄)
```
/code-review high supabase/migrations
```
중점: `purchases` INSERT 봉인, `chapters_select_preview`가 맨 앞 published 챕터 하나만 여는지, `workbook_responses`를 작성자 본인만 읽는지, `workbook_response_stats()`가 소유자 응답을 빼는지, `service_role` GRANT의 롤 존재 확인, SECURITY DEFINER 함수의 `search_path`.

### 3. 독자 응답 쓰기 경로 — `high` (약 1,500줄)
```
/code-review high src/app/api/books/[bookId]/responses
/code-review high src/lib/workbook
/code-review high src/components/reader/WorkbookResponsesProvider.tsx
/code-review high src/components/reader/templates
```
중점: `(block_id, field_key)`로만 매칭하는지, `chapter_id`와 값 컬럼을 서버가 정하는지, 부분 실패를 `rejected`로 돌려주는지, 빈 문자열 → null, 서버 값이 캐시를 이기는지, 캐시 키에 보는 사람이 들어가는지, `isAnswered()`와 `answered_count`가 일치하는지.

### 4. 저작 측 블록 동기화와 출간 — `high` (약 1,100줄)
```
/code-review high src/components/editor/extensions/templates
/code-review high src/lib/template-node-id.ts
/code-review high src/app/api/chapters
/code-review high src/app/api/books/[bookId]/route.ts
/code-review high src/lib/publish-checks.ts
/code-review high src/lib/publish-checks-loader.ts
```
중점: `block_id`를 재생성하는 폴백이 없는지(`parseHTML`의 `|| generateNodeId()`), 동기화 실패가 챕터 저장을 실패시키지 않는지, 공개 시 `status`와 `visibility`를 함께 바꾸는지, `published_at`을 서버가 비어 있을 때만 찍는지.

### 5. 보안 입력 경계 — `medium` (약 700줄)
```
/code-review medium src/lib/sanitize.ts
/code-review medium src/components/reader/HtmlContentRenderer.tsx
/code-review medium src/app/api/upload
/code-review medium src/lib/upload-parser.ts
/code-review medium src/app/api/books/[bookId]/cover
/code-review medium src/app/api/books/[bookId]/images
/code-review medium src/lib/safe-redirect.ts
/code-review medium src/app/auth
/code-review medium src/lib/supabase
/code-review medium src/middleware.ts
```
중점: sanitize 허용 목록, 파일 타입·크기 검증, Storage 경로 충돌·경로 조작, 오픈 리다이렉트, 서버 전용 키가 클라이언트로 새지 않는지.

### 6. 내보내기 (PDF·EPUB) — `medium` (약 1,500줄)
```
/code-review medium src/lib/export-source.ts
/code-review medium src/app/api/pdf
/code-review medium src/app/api/epub
/code-review medium src/lib/pdf-generator.tsx
/code-review medium src/lib/epub-generator.ts
/code-review medium src/lib/template-fallback.ts
```
중점: 권한을 `loadExportSource()` 하나로 판정하는지, 미리보기 권한으로 내보내지 않는지, 고아 답을 버리지 않는지, italic·이모지 사용, EPUB의 XML 이스케이프.

### 7. 조회·분석 API — `medium` (약 700줄)
```
/code-review medium src/app/api/analytics
/code-review medium src/app/api/my
/code-review medium src/app/api/explore
/code-review medium src/app/api/landing
/code-review medium src/app/api/books/[bookId]/detail
/code-review medium src/app/api/books/route.ts
```
중점: 크리에이터에게 응답 원문이 새지 않는지, 비공개 책이 목록에 섞이지 않는지, 인증·소유자 확인.

### 8. 나머지 UI — `medium`
```
/code-review medium src/components/reader/ReaderView.tsx
/code-review medium src/app/reader
/code-review medium src/components/editor
/code-review medium src/app/create
/code-review medium src/stores
```
중점: 버그 위주. 디자인·스타일은 이 리뷰 범위가 아니에요(DESIGN.md 점검은 별도).

## 진행 체크리스트

| 단계 | 날짜 | 발견 | 수정 | 비고 |
|---|---|---|---|---|
| 1. 결제·접근 | 2026-10-01 | 56건(중복 정리 후 P0 7 · P1 26 · P2 11) | 0 | 미검증. [결과](code-review-results/01-payments-access.md) |
| 2. DB·RLS | 2026-10-02 | 10건(P0 3 · P1 5 · P2 2, 1단계와 3건 겹침) | 0 | 결제 2건만 앱 코드와 대조. [결과](code-review-results/02-db-rls.md) |
| 3. 응답 쓰기 |  |  |  |  |
| 4. 블록 동기화·출간 |  |  |  |  |
| 5. 보안 입력 |  |  |  |  |
| 6. 내보내기 |  |  |  |  |
| 7. 조회·분석 API |  |  |  |  |
| 8. 나머지 UI |  |  |  |  |

## 검증

- 각 단계 수정 후: `npm run typecheck`, `npm test`, `npm run lint` (에러 10개 이하 유지), 필요 시 `npm run build`.
- RLS를 고치면 `src/lib/supabase/__tests__/rls.test.ts`에 통과·차단 케이스를 함께 추가해요.
