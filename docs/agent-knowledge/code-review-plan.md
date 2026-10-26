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
- **리뷰와 수정을 나눠요.** 먼저 지적만 받고, 확인한 것만 `--fix` 또는 별도 요청으로 고쳐요. 고친 뒤에는 `npm run typecheck && npm test && npm run lint`를 실행해요 (lint 에러는 기존 10개보다 늘지 않으면 돼요. 1차 당시 기준이고 지금은 9개).
- **이미 아는 부채는 제외해요.** 기존 lint 에러 10개(1차 당시, React Compiler)는 리뷰 결과에서 무시해요.
- 각 단계가 끝나면 아래 체크리스트에 날짜와 발견 개수를 적어요.
- **1~4단계 수정은 [code-review-fix-plan.md](code-review-fix-plan.md)를 따라요.** 수정이 모두 끝난 뒤 5단계부터 리뷰를 이어 가요.

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

## 2차 — 10-05 이후 작업분 (9~14단계)

2026-10-22에 세웠어요. 1차 수정이 main에 모두 들어간 시점은 `34aca10`(PR #12·#13·#14)이고, 그 뒤 PR #15~#34가 리뷰 없이 병합됐어요(소스 113개 파일, +6,086 / −1,587줄). 진행 방식은 1차와 같아요 — 한 세션에 한 단계, 경로마다 따로 실행, 리뷰와 수정 분리.

- **기준**: `34aca10` → `ab6ba02`. 각 단계 시작 때 `git diff 34aca10 HEAD -- <경로>`로 변경 범위를 먼저 보고, 파일 전체를 보되 변경된 부분 중심으로 봐요.
- **effort**: 9~11단계 `high`, 12~14단계 `medium`.
- **제외**: lint 에러 9개(React Compiler), 7-P2-9, 공개본/편집본 분리(M6 이후).
- **결과**: `code-review-results/09-*.md` ~ `14-*.md`, 7단계 결과 문서와 같은 형식.
- **수정**: 근본 원인별 묶음(한 묶음 = 한 PR). 마이그레이션은 `00015`부터 새로 추가해요(`00015`는 10-A가 씀).
- **묶음 이름에는 단계 번호를 붙여요** (`9-A`, `10-B`). 결과 문서마다 A~D를 따로 정하므로 "묶음 A"만으로는 어느 단계인지 알 수 없어요. 지적 번호도 다른 문서에서 부를 때는 `9-P0-1`처럼 써요.
- **수정 순서** (2026-10-23):
  1. 급한 묶음 먼저 — `9-A`(남의 계정에 답이 쓰임, P0) → `10-A`(외부 URL이 공개 화면에 박힘, `00015`). 두 묶음은 겹치는 파일이 없어 병렬로 해도 돼요.
  2. 그다음 11~13단계 리뷰. 10-D가 13단계 경로(`api/landing`·`explore`)를, 10-A가 11단계 경로(`api/books/[bookId]/route.ts`)의 전제를 바꾸므로 나머지 묶음을 먼저 고치면 리뷰 기준이 흔들려요. 리뷰 대상 커밋은 그 시점의 HEAD로 적어요.
  - (2026-10-25) 11단계 리뷰에서 `11-A`(bio 정규식 ReDoS, P0)가 나왔어요. 12·13단계 리뷰를 기다리지 않고 먼저 고쳐요 — `authoring-input.ts`만 만지고 다른 묶음과 겹치지 않아요.
  - (2026-10-25) 12단계 리뷰에서 `12-A`(sanitize 전 크기 검사 없음·sanitize 우회)와 `12-B`(블록 삽입이 선택한 블록을 덮어 답이 고아가 됨)가 P0로 나왔어요. 13단계 리뷰 뒤 나머지 묶음과 함께 순서를 정하되, 이 둘은 다른 묶음과 파일이 겹치지 않아 먼저 해도 돼요.
  - (2026-10-26) 13단계 리뷰에서 `13-A`(오픈 리다이렉트, P0)가 나왔어요. 11-A처럼 바로 고쳐요 — `safe-redirect.ts`와 login·signup 페이지만 만져요. `13-B`(이행 RPC가 확정 실패를 예외로 던짐)는 도달 경로가 거의 없어 P1이지만 마이그레이션이 필요해 그다음 따로 해요.
  3. 나머지 묶음(`9-B~D`, `10-B~D`, 11~13단계 묶음)은 리뷰가 끝난 뒤 같은 파일·같은 원인끼리 다시 맞춰 순서를 정해요. 단계 안의 순서 제약(10-B → 10-C 등)은 각 결과 문서를 따라요.
- **여러 단계를 병렬로 돌릴 때** — 단계마다 브랜치·워크트리를 따로 쓰면 각 PR이 다른 단계의 결과를 모르고 병합돼요(9·10단계가 그랬어요). 결과 문서 PR에는 아래 체크리스트의 그 단계 행을 함께 채우고, 병합 전에 main을 받아 다른 단계 결과 문서와 묶음 이름·파일이 겹치는지 확인해요.

### 9. 독자 응답·쪽 넘김 리더 — `high` (약 1,700줄 변경)
```
/code-review high src/components/reader/WorkbookResponsesProvider.tsx
/code-review high src/components/reader/paged
/code-review high src/components/reader/ReaderView.tsx
/code-review high src/components/reader/templates
/code-review high src/components/reader/SaveStatusBadge.tsx src/components/reader/reader-links.ts
```
중점: `canSaveResponses`가 false일 때 provider가 캐시를 읽지도·쓰지도·지우지도 않는지와 입력이 실제로 막히는지(`canWrite`/`lock`/`BlockLockNotice`), 시트(`BlockSheet`)를 거쳐도 저장 경로·한 번에 하나 flush·블록 단위 실패가 그대로인지와 시트를 닫을 때 미전송 답이 버려지지 않는지, 카드 높이가 답·실패 상태로 바뀌지 않는지(상태 문구는 `block-status.ts`/`useSaveStatus()`에서만), `usePagedColumns`가 위치를 요소로 지키고 `childList`만 보는지(무한 재분할·누수), `turn-input.ts`가 입력·한글 조합·시트 중 조작을 무시하는지, 범위 밖 기능(진행률 저장·글자 크기)이 들어오지 않았는지.

### 10. Storage·프로필·마이그레이션 00012~00014 — `high` (약 900줄 변경)
```
/code-review high supabase/migrations/00012_book_audience.sql supabase/migrations/00013_book_detail_image.sql supabase/migrations/00014_author_profile.sql
/code-review high src/lib/book-image-route.ts
/code-review high src/app/api/books/[bookId]/cover src/app/api/books/[bookId]/detail-image
/code-review high src/app/api/my
/code-review high src/lib/storage-cleanup.ts src/lib/storage-image.ts next.config.ts
/code-review high src/app/api/authors
```
중점: `avatars` 정책이 첫 폴더 = `auth.uid()`에서만 열리고 SELECT가 본인뿐인지, `covers`의 `detail-` 파일이 같은 소유자 정책을 타는지, 프로필 PUT이 `avatar_url`을·책 PUT이 `detail_image_url`/`cover_image_url`을 거절하는지, `bio` 80자·`about` 2000자, 파일 타입·크기·경로 조작, DB 갱신 뒤 옛 파일 삭제와 본인 폴더 밖 URL 보존, `next.config.ts` 원격 호스트가 우리 Storage로만 좁혀졌는지, `/api/authors`가 비공개 책·초안을 섞거나 조회 실패를 빈 결과로 넘기지 않는지, `rls.test.ts`에 통과·차단 케이스가 모두 있는지.

### 11. 출간 경로 개편 — `high` (약 450줄 변경)
```
/code-review high src/lib/book-publish.ts
/code-review high src/app/api/books/[bookId]/route.ts
/code-review high src/lib/authoring-input.ts
/code-review high src/app/create/edit/[bookId]/EditPageContent.tsx
/code-review high src/components/preview/PublishChecklist.tsx
```
중점: 공개·내리기가 `publishBook()`/`unpublishBook()` 하나로만 가는지, 판정이 `loadPublishChecks()` 하나인지, 422 `blockers` 처리, `status: published` 단독 요청에 `visibility: public`이 붙는지, 설정 모달에 공개 입력이 남지 않았는지, 1000건 읽기·조회 실패 500.

### 12. 저작 에디터 변경 — `medium` (약 900줄 변경)
```
/code-review medium src/components/editor
/code-review medium src/lib/sanitize.ts
/code-review medium src/components/dashboard/BookMetadataForm.tsx
```
중점: 새 블록 입구(`workbook-blocks.ts`·`SlashCommand`·툴바)가 `TemplateNodeIds`로 ID를 받는지와 재생성 폴백이 없는지, 위 첨자 허용이 sanitize·EPUB(`toXhtml`)·PDF 폴백까지 맞는지, 메타데이터 폼의 "이런 분께"·소개 이미지 입력 검증.

### 13. 인증·공개 화면·내보내기 변경분 — `medium`
```
/code-review medium src/app/auth src/lib/safe-redirect.ts src/stores/auth-store.ts
/code-review medium src/app/api/landing src/app/api/books/[bookId]/detail
/code-review medium src/app/book src/app/author src/app/page.tsx src/components/landing
/code-review medium src/lib/pdf-generator.tsx src/lib/payments/fulfillment.ts
```
중점: 로그인 뒤 기본 이동 변경이 오픈 리다이렉트를 열지 않는지, Supabase 원문이 화면에 새지 않는지(`toAuthFailure()`), 목록이 `status`/`visibility`를 직접 거르는지, PDF 변경분이 이모지·italic·폰트 밖 글자를 넣지 않는지(`pdf-fallback-glyphs.test.ts`).

### 14. 1회용 이전 스크립트 — `medium` (선택)
```
/code-review medium scripts/import-survival-guide
```
이미 실행했으므로 버그 위주로 짧게. 블록을 프로덕션 함수(`syncChapterWorkbookBlocks()` 등)를 거쳐 넣었는지, 블록 ID를 1회만 부여했는지만 봐요.

## 진행 체크리스트

| 단계 | 날짜 | 발견 | 수정 | 비고 |
|---|---|---|---|---|
| 1. 결제·접근 | 2026-10-01 | 56건(중복 정리 후 P0 7 · P1 26 · P2 11) | 0 | 미검증. [결과](code-review-results/01-payments-access.md) |
| 2. DB·RLS | 2026-10-02 | 10건(P0 3 · P1 5 · P2 2, 1단계와 3건 겹침) | 0 | 결제 2건만 앱 코드와 대조. [결과](code-review-results/02-db-rls.md) |
| 3. 응답 쓰기 | 2026-10-02 | 40건 → 중복 정리 후 29건(P0 5 · P1 20 · P2 4, 2단계와 3건 겹침) | 0 | 미검증. [결과](code-review-results/03-responses.md) |
| 4. 블록 동기화·출간 | 2026-10-02 | 56건 → 중복 정리 후 43건(P0 5 · P1 26 · P2 12, 2·3단계와 5건 겹침) | 0 | 3건만 scratchpad에서 재현, 앱 미확인. [결과](code-review-results/04-block-sync-publish.md) |
| 5. 보안 입력 | 2026-10-03 | 35건 → 중복 정리 후 28건(P0 3 · P1 13 · P2 12) | 28 (묶음 A~D, PR #8~#11) | P0 3건·sanitize 3건은 코드 대조, 2건은 node 확인. 수정은 묶음 A~D로 끝냄. 앱 화면 확인은 아직 하지 않음. [결과](code-review-results/05-security-inputs.md) |
| 6. 내보내기 | 2026-10-04 | 21건 | 21 (PR #12) | 결과 문서 미작성 |
| 7. 조회·분석 API | 2026-10-04 | 25건 → 중복 정리 후 22건(P0 0 · P1 9 · P2 13) | 21 (묶음 A~D, P2-9 보류) | 위치·RLS 대조함. 브랜치 `Yngie-C/fix-read-api`. `00011` 원격 적용·화면 확인 남음. [결과](code-review-results/07-read-analytics.md) |
| 8. 나머지 UI | 2026-10-04 | 10건 | 10 (PR #13) | 결과 문서 미작성 |
| 9. 리더·응답 | 2026-10-22 | 45건 → 중복 정리 후 41건(P0 2 · P1 22 · P2 17) | 22 (9-A, 9-B) | 6건만 코드 대조. 9-A는 회귀 테스트 5개(수정 전 코드에서 실패 확인). 9-B(쪽 위치 12건, 10-27)는 12건 모두 대조, 쪽 계산은 브라우저 확인 전. 묶음 9-A~9-D. [결과](code-review-results/09-reader-responses.md) |
| 10. Storage·프로필 | 2026-10-23 | 53건 → 중복 정리 후 43건(P0 0 · P1 22 · P2 21) | 5 (10-A) | 16건 코드 대조. P1-3은 운영 `pg_policies`에 우리 정책뿐임을 확인(10-24). 10-A는 `00015` + 업로드 라우트 admin 쓰기, 새 DB 테스트 4개는 `00015` 없이 실패 확인. 묶음 10-A~10-D, 결정 7개(1은 트리거로 정함). [결과](code-review-results/10-storage-profile.md) |
| 11. 출간 경로 | 2026-10-24 | 44건 → 중복 정리 후 41건(P0 3 · P1 20 · P2 18) | 9 (11-A) | 9건 코드 대조, P0-1(bio ReDoS)은 node로 시간 확인. P2-3은 10-P1-18과 같아 10-C로. 묶음 11-A~11-D, 결정 4개. [결과](code-review-results/11-publish-path.md) |
| 12. 에디터 | 2026-10-25 | 28건(P0 2 · P1 14 · P2 12, 겹침 없음) | 0 | 11건 코드 대조. P2-10(UTF-16 `maxLength`)은 11-A 결정대로 고치지 않음. 묶음 12-A~12-D, 결정 3개(모두 10-25 정함, 운영 DB에 `class`·외부/`data:` 이미지 든 장 0). 12-D는 11-B 뒤. [결과](code-review-results/12-editor.md) |
| 13. 인증·공개 화면 | 2026-10-25 | 40건 → 중복·오판 정리 후 38건(P0 1 · P1 13 · P2 24) | 3 (13-A: P0-1·P2-9 일부, 13-B: P1-11) | 13건 코드 대조, P0-1은 node로 재현. P-2(부분 취소가 구매를 닫음)는 `void_payment`가 부분 취소를 지나쳐 뺐고, P-1(이행 RPC 불일치)은 confirm이 잠근 금액으로 승인해 P1로 낮춤. 묶음 13-A~13-E, 결정 2개(10-26 모두 권장안으로 정함). 13-A(PR #43)·13-B(PR #44, `00016`)는 10-26 병합, `00016` 운영 적용은 아직. 13-E는 12-A 뒤. [결과](code-review-results/13-auth-public-export.md) |
| 14. 이전 스크립트 |  |  |  | 선택 |

## 검증

- 각 단계 수정 후: `npm run typecheck`, `npm test`, `npm run lint` (에러 9개 이하 유지), 필요 시 `npm run build`.
- RLS를 고치면 `src/lib/supabase/__tests__/rls.test.ts`에 통과·차단 케이스를 함께 추가해요.
