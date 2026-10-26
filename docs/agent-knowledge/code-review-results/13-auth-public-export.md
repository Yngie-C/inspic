# 13단계 리뷰 결과 — 인증·공개 화면·내보내기 변경분

- 날짜: 2026-10-25
- 실행 (경로마다 따로, 워크트리 `orca/workspaces/inspic/code-review-11`):
  ```
  /code-review medium src/app/auth src/lib/safe-redirect.ts src/stores/auth-store.ts
  /code-review medium src/app/api/landing src/app/api/books/[bookId]/detail
  /code-review medium src/app/book src/app/author src/app/page.tsx src/components/landing
  /code-review medium src/lib/pdf-generator.tsx src/lib/payments/fulfillment.ts
  ```
- 대상 커밋: `025759b` (12단계 결과 문서, 코드는 `ed99a1b`와 같음)
- 원 지적 40건(auth 10 · api 10 · 화면 10 · pdf·결제 10). 겹친 1건(landing 정렬, D-2 = B-6)을 합치고 틀린 1건(P-2)을 빼서 **38건 (P0 1 · P1 13 · P2 24)**.
  - 지적 번호 뒤 괄호는 원 출력의 경로·순번이에요(`A` auth, `D` landing·detail API, `B` 책·저자·랜딩 화면, `P` pdf·결제).
  - **뺀 것 — P-2(부분 취소가 구매를 닫음)**: `reconcilePayment()`가 `markVoided`를 부르는 것은 맞지만, `void_payment`가 `p_status <> 'partial_canceled'`일 때만 구매를 닫아요(`00005_payment_fixes.sql:372`). 부분 취소는 지금도 접근을 유지해요.
  - **낮춘 것 — P-1(RPC가 금액·키 불일치에 던짐)**: 리뷰 직후에는 P0급으로 봤지만, confirm이 Toss에 **잠근 금액**(`transaction.amount`)으로 승인을 요청하므로(`api/payments/confirm/route.ts:117`) 금액 불일치는 사실상 생기지 않아요. 결과(돈은 나가고 책·환불 둘 다 없음)는 나쁘지만 도달 경로가 거의 없어 P1이에요.
- **검증 상태**
  - 직접 대조함: P0-1(`new URL("/..//evil.com", base)`의 pathname이 `//evil.com`, origin은 base 그대로 — node로 확인), P1-1(`reset-password/page.tsx:41` 세션 유무만 봄, `middleware.ts:65`가 로그인 상태도 통과), P1-2(`auth-store.ts:66` try/finally에 catch 없고 구독이 await 뒤), P1-3(`callback/route.ts:21` 실패 리다이렉트에 `next` 없음), P1-6(`detail/route.ts:16` `select("*")`), P1-7(`BookDetailView.tsx:376·385` `access`가 null이면 유료 책은 구매 버튼), P1-8(`BookDetailView.tsx:192` `estimated_reading_time`을 쓰는 코드가 없고 `countWords()`는 공백으로 나눈 어절 수), P1-9(`BookDetailClient.tsx:153` `isOwner`만 바꾸고 `accessInfo`는 서버 판정 그대로), P1-11(`00005:199~208` 두 `RAISE EXCEPTION`, `fulfillment.ts:170` 모든 예외를 `deferred`), P2-2(`landing/route.ts:82` `nullsFirst`·id 정렬 없음), P2-5(`landing/route.ts:5` `revalidate = 300`).
  - 중점으로 적은 "Supabase 원문이 화면에 새지 않는지"·"목록이 `status`/`visibility`를 직접 거르는지"·"PDF가 이모지·italic을 넣지 않는지"는 지적이 나오지 않았어요(landing은 두 `.eq`로 거름, `toAuthFailure()`를 거침).
  - 나머지는 리뷰 출력 그대로이고, 테스트·앱 확인은 하지 않았어요. medium이라 리뷰 안에서 검증 단계도 돌지 않았어요.

계획은 [code-review-plan.md](../code-review-plan.md), 이전 결과는 [12-editor.md](12-editor.md)를 보세요.

## 공통 원인 네 가지

1. **검사한 값과 쓰는 값은 같지만, 검사가 "해석한 뒤의 모양"을 보지 않는다.** `safeInternalPath()`는 origin만 보고 해석 결과의 pathname이 `//`로 시작하는지는 보지 않아요(P0-1). 주석이 막겠다고 적은 공격이 점(`..`) 하나로 다시 열려요.
2. **"모름"을 "아님"으로 그린다.** 접근 판정이 오지 않았거나 실패하면 구매 버튼(P1-7), 인증 조회가 실패하면 비소유자 목차(P2-4), 메타데이터 조회가 실패하면 "찾을 수 없어요"(P2-15·P2-16), 이행 RPC가 "절대 안 됨"으로 던져도 "아직 모름"(P1-11). AGENTS.md의 "조회 실패를 빈 결과로 넘기지 마세요"가 화면 쪽으로 번진 것이에요.
3. **보는 사람이 바뀌어도 화면 상태가 따라오지 않는다.** auth 리스너가 아예 붙지 않거나 겹치고(P1-2·P2-6), 로그인 뒤 서버 렌더를 새로 받지 않고(P1-5), 상세 화면 캐시 키에 보는 사람이 없어(P1-10) 다른 계정에 draft 장 제목이 보여요. viewAs는 화면의 절반(소유자 여부)만 바꿔요(P1-9).
4. **PDF 본문 변환이 손으로 고른 태그만 안다.** 인라인 태그 목록에 없는 `code`·`sub`는 공백이 되고(P1-12), `img`는 흔적 없이 사라지고(P1-13), `br`·중첩 인용도 무너져요(P2-19·P2-20). 12단계 공통 원인 1(sanitize 허용 목록)과 같은 모양이라, 12-A가 허용 목록을 넓히면 PDF 쪽도 함께 맞춰야 해요.

## P0

| # | 위치 | 지적 |
|---|---|---|
| P0-1 | `lib/safe-redirect.ts:29` (A-1) | 해석한 pathname을 그대로 돌려주는데, 점 구간 정리 결과가 `//evil.com`이 될 수 있음 → `/auth/login?redirect=/..//evil.com`(또는 `/.//evil.com`, `/%2e%2e//evil.com`)으로 로그인하면 `router.push("//evil.com")`가 외부 사이트로 보냄. 함수가 막으려던 오픈 리다이렉트 그대로. |

## P1

| # | 위치 | 지적 |
|---|---|---|
| P1-1 | `app/auth/reset-password/page.tsx:41` (A-9) | 재설정 화면이 복구 세션이 아닌 아무 로그인 세션이나 받고, 미들웨어가 로그인 상태도 통과시킴 → 로그인된 채 둔 공용 기기에서 현재 비밀번호 없이 새 비밀번호로 바꿔 계정을 가져감. 처리는 결정 1. |
| P1-2 | `stores/auth-store.ts:66` (A-2) | `initialize`에 catch가 없고 `onAuthStateChange` 구독이 `getSession`·`fetchProfile` await 뒤 → 둘 중 하나가 던지면 리스너가 붙지 않아, 이후 로그인해도 store는 `user: null`. 새로고침 전까지 헤더·리더가 로그아웃 상태이고 `canSaveResponses`가 false. |
| P1-3 | `app/auth/callback/route.ts:21` (A-5) | 실패 리다이렉트에 `next`를 싣지 않음 → 리더에서 가입했는데 인증 링크가 만료되면, 다시 보낸 메일·다시 로그인 모두 `/`로 감. 보던 책으로 돌아오지 못함. |
| P1-4 | `app/auth/callback/route.ts:32` (A-6) | 다른 브라우저에서 가입 인증 링크를 열면 Supabase는 이미 이메일을 인증했는데 PKCE 교환만 실패(`flow_state_not_found`) → "같은 브라우저에서 다시 열어 주세요". 시키는 대로 다시 열면 이미 쓴 링크라 `link_invalid`, 독자는 가입이 실패한 줄 앎. 가입 확인이면 "인증됐어요. 로그인해 주세요"가 맞음. |
| P1-5 | `app/auth/login/LoginForm.tsx:41` (A-8) | 로그인 성공 뒤 `router.push`만 하고 `router.refresh()`가 없음 → 익명 상태로 캐시된 RSC(보던 리더 화면)가 그대로 보여 잠긴 화면이 남을 수 있음. `finally`가 이동 중에 버튼을 다시 켜 두 번 제출됨. |
| P1-6 | `api/books/[bookId]/detail/route.ts:16` (D-3) | `select("*")`로 책 행 전체를 비소유자·익명에게 보냄 → 공개 책 상세 JSON에 `source_file_url`(업로드 원본 경로)·`source_type`이 실림. 나중에 더하는 내부 컬럼도 자동으로 나감. 비소유자에게는 컬럼을 고르기. |
| P1-7 | `app/book/[bookId]/BookDetailView.tsx:385` (B-1) | 접근 판정이 null(불러오는 중·`/access` 5xx)이면 유료 책에서 "N원에 구매하기"를 그림 → `BookDetailClient.tsx:111` 주석이 막으려던 "산 독자에게 구매 버튼"을 그대로 만듦. 정상일 때도 판정이 오기 전까지 깜빡임. 판정 전에는 버튼 자리 대기, 실패면 "확인하지 못했어요" + 다시 시도. |
| P1-8 | `app/book/[bookId]/BookDetailView.tsx:194` (B-2) | `estimated_reading_time`을 채우는 코드가 없어 늘 `word_count`(공백으로 나눈 어절 수)에 "자"를 붙임 → 3,000자 장이 목차에 "700자"로 나옴. |
| P1-9 | `app/book/[bookId]/BookDetailClient.tsx:155` (B-3) | `?viewAs=customer`가 `isOwner`만 false로 바꾸고 `accessInfo`는 서버 판정(`owner`, `hasAccess: true`) 그대로 → 저자가 유료 책을 독자 화면으로 보면 "구매 보유 중"과 "읽기"만 나오고, 구매 버튼·미리보기 표시는 안 나옴. 사지 않은 독자 화면이 재현되지 않음. |
| P1-10 | `app/book/[bookId]/BookDetailClient.tsx:57` (B-4) | `book-detail` 쿼리 키에 보는 사람이 없고 기본 staleTime 5분 → 저자가 draft 장까지 받은 뒤 같은 탭에서 로그아웃·계정 전환하면, 5분간 다른 사람 화면 목차에 draft 장 제목이 나옴. `/access` fetch도 `[bookId]`에만 묶여 다시 판정하지 않음. |
| P1-11 | `lib/payments/fulfillment.ts:170` (P-1) | `fulfill_payment`는 절대 성공할 수 없는 경우(금액 불일치·결제 키 불일치, `00005:199~208`)에도 예외를 던지고, 호출자는 모든 예외를 `deferred`로 봄 → webhook은 5xx로 Toss가 포기할 때까지 재시도, confirm은 "처리 중". 돈은 나가고 책도 환불도 없음. 도달 경로는 거의 없음(위 "낮춘 것"). |
| P1-12 | `lib/pdf-generator.tsx:398` (P-3) | 인라인으로 푸는 태그가 `strong·b·em·i·u·s·mark·span·a`뿐 → `code`(Tiptap 기본 mark)·`sub`·`del`·`small`·`abbr`가 `collapse()`에서 공백이 됨. `run <code>npm</code>.json`이 "run npm .json", `H<sub>2</sub>O`가 "H 2 O". 도구 설명이 많은 원고라 거의 모든 장에 나옴. |
| P1-13 | `lib/pdf-generator.tsx:466` (P-6) | `<img>`·`<figure>`가 일반 글 조각으로 들어가 통째로 지워짐 → 그림이 대체 글도 캡션도 없이 사라져 "아래 그림을 보세요" 뒤가 빈칸. EPUB은 대체 글을 남김(AGENTS.md 내보내기 규칙). |

## P2

| # | 위치 | 지적 |
|---|---|---|
| P2-1 | `api/books/[bookId]/detail/route.ts:17` (D-1) | `bookId`를 UUID로 검사하지 않음 → `/api/books/abc/detail`이 22P02로 500, 화면은 "불러오지 못했어요" + 다시 시도. `explore`는 7-P2-6에서 `isUuid()`로 고침. |
| P2-2 | `api/landing/route.ts:82` (D-2 = B-6) | 새로 나온 책이 `published_at` 내림차순만 → `published_at`이 NULL인 공개 책(옛 행·이전한 책)이 맨 위, 같은 시각끼리 순서가 요청마다 바뀜. `explore?sort=newest`(7-P2-7에서 `nullsFirst: false` + id)와 순서가 달라 "전체 보기"에서 맨 뒤로 감. |
| P2-3 | `api/landing/route.ts:75` (D-6) | RLS가 이미 허용하는 공개 데이터를 `service_role`로 읽음 → 두 `.eq` 중 하나가 빠지면 비공개·초안·구매한 비공개 책이 랜딩에 막힘 없이 나옴. `createClient()`면 RLS가 한 번 더 막음. |
| P2-4 | `api/books/[bookId]/detail/route.ts:11` (D-4) | `getAuthUser()`가 인증 조회 실패에도 null → 소유자 요청이 `book_table_of_contents`로 가서 draft 장이 빠진 목차가 200으로 나옴. 실패는 실패로. |
| P2-5 | `api/landing/route.ts:5` (D-5) | 인자 없는 GET + `revalidate = 300`이라 정적 캐시될 수 있음 → 빌드 때 DB·secret이 없으면 500이나 빈 목록이 5분 이상 나감. `service_role`이 빌드 시점에 필요해짐. `dynamic` 설정과 캐시 헤더로 바꿀지 확인. |
| P2-6 | `stores/auth-store.ts:83` (A-3) | 구독을 풀지 않고 `initialize`를 두 번 부르는 것을 막지 않음 → StrictMode·리마운트로 리스너가 겹쳐, `SIGNED_IN`마다 store를 두 번 쓰고 프로필 조회도 두 번. |
| P2-7 | `stores/auth-store.ts:82` (A-4) | 같은 사용자의 `SIGNED_IN`(탭 복귀마다 옴)에도 `user` 객체를 바꾸고 프로필을 다시 읽음 → `user`에 묶인 이펙트가 다시 돎. id가 같으면 참조를 유지하고 조회를 건너뛰기. |
| P2-8 | `app/auth/callback/route.ts:20` (A-7) | 재설정 링크가 무효·이미 쓰였으면(메일 스캐너가 먼저 열면 흔함) 로그인 문구("다시 로그인해 주세요")로 감 → 비밀번호를 잊은 사람에게 재설정 동작이 없음. 만료(`reset_link_expired`)처럼 재설정 쪽 문구로. |
| P2-9 | `app/auth/signup/page.tsx:15` (A-10) | redirect 파싱(`safeInternalPath(redirect, "") \|\| null`)이 login·signup에, 비밀번호 확인 불일치 검사·문구가 signup·reset-password에 따로 있음 → P0-1 같은 수정이 한쪽만 들어감. |
| P2-10 | `api/landing/route.ts:32` (D-7) | 저자 맵 조회가 `explore/route.ts:93~110`과 두 벌이고 이미 다름(landing만 bio trim·`author_bio`) → `lib/`의 `fetchAuthorMap` 하나로. |
| P2-11 | `api/books/[bookId]/detail/route.ts:50` (D-8) | `author_bio`를 trim하지 않음 → 공백뿐인 bio가 landing에서는 null, 상세에서는 빈 줄. P2-10과 함께. |
| P2-12 | `api/books/[bookId]/detail/route.ts:36` (D-9) | getUser → books → 프로필 → 장/목차가 네 단계 직렬 → 프로필과 장은 `Promise.all`, getUser는 책 조회와 병렬. 결제 화면도 이 라우트를 부름. |
| P2-13 | `api/books/[bookId]/detail/detail-route.test.ts:34` (D-10) | 늘 로그인 사용자로 mock → 익명(목차 RPC) 경로와 UUID가 아닌 id 경로가 테스트에 없음. P2-1·P2-4를 고칠 때 함께. |
| P2-14 | `app/book/[bookId]/BookDetailView.tsx:98` (B-5) | 소유자 표시가 published+public이 아니면 모두 "비공개 · 나만 볼 수 있음" → 산 독자는 내린 책도 계속 읽음(00006). 판매 이력이 있으면 "새 독자에게 보이지 않아요 · 산 독자는 계속 읽어요". |
| P2-15 | `app/book/[bookId]/page.tsx:17` (B-7) | `generateMetadata`가 `.single()`의 error를 보지 않음 → 일시 장애에 og 제목이 "책을 찾을 수 없어요"로 캐시돼 공유 링크가 삭제된 책처럼 보임. |
| P2-16 | `app/author/[userId]/page.tsx:25` (B-8) | 프로필은 있고 `display_name`만 빈 저자를 메타데이터에서 "저자를 찾을 수 없어요"로 냄(화면은 "이름 없는 저자"로 정상). 조회 error도 무시. |
| P2-17 | `app/book/[bookId]/BookDetailView.tsx:418` (B-9) | `ShareButton`의 `setTimeout`을 정리하지 않아 연타하면 "복사했어요"가 일찍 사라지고, 공유 URL에 `?viewAs=customer`가 그대로 실림. |
| P2-18 | `app/book/[bookId]/BookDetailClient.tsx:101` (B-10) | 공개·비공개 전환 성공 때 `book-detail`만 무효화 → `['landing']`·`['author', ownerId]`·다른 책 캐시가 최대 5분 옛 상태. |
| P2-19 | `lib/pdf-generator.tsx:375` (P-4) | `<br>`을 `\n`으로 바꾼 뒤 `collapse()`가 공백으로 접음 → 시·주소·단계 줄(Shift+Enter)이 한 줄로 이어짐. |
| P2-20 | `lib/pdf-generator.tsx:412` (P-5) | 블록 분할 정규식이 게으른 일치라 중첩 `blockquote`가 안쪽 닫는 태그에서 끝남 → 바깥 인용의 뒷부분이 인용 스타일 없이 일반 문단으로. |
| P2-21 | `lib/payments/fulfillment.ts:183` (P-7) | RPC 결과 모양이 예상과 다르면 이미 커밋됐을 수 있는데도 `stranded` → 열린 구매에 "문의해 주세요", webhook은 매번 500. P1-11과 함께 결과 해석을 고칠 때. |
| P2-22 | `lib/pdf-generator.tsx:841` (P-8) | `renderBookPdf()`의 두 번 렌더가 장마다 `applyTemplateFallback`·`stripHtmlForPdf`·`placeOrphans`도 두 번 → 장별 파싱은 한 번만 하고 레이아웃만 반복. |
| P2-23 | `lib/pdf-generator.tsx:350` (P-9) | `decodeEntities`·`fromCodePoint`가 `template-fallback.ts:77~93`의 복사본이고 이미 다름(`&nbsp;` 처리, `&apos;`). 하나로. |
| P2-24 | `lib/pdf-generator.tsx:498` (P-10) | PDF 표지 "Cover", 목차 "목차 (Table of Contents)"(522행) → 사용자 노출 문구는 한국어로. |

## 수정 묶음

묶음 이름은 `13-`을 붙여요. 한 묶음 = 한 PR. 순서는 **13-A → 13-B → 13-C → 13-D → 13-E**예요.

- 13-A는 P0-1(오픈 리다이렉트)이라 12단계 묶음보다 먼저 해요. 11-A처럼 작게, 마이그레이션 없이.
- 13-B는 마이그레이션이 필요해 따로 해요. 번호는 그때 비어 있는 다음 번호(지금은 `00016`). 11-C도 마이그레이션을 쓰므로 먼저 병합되는 쪽이 번호를 가져가요.
- 13-C(인증 흐름)는 결정 1을 정한 뒤. `auth-store.ts`·`callback`을 13-A와 함께 만지지 않으려고 13-A 뒤에 해요.
- 13-E(PDF)는 12-A(sanitize 허용 목록에 `del`·`sub` 추가) **뒤**에 해요. 허용 목록이 정해져야 PDF가 다룰 태그 목록이 정해져요.

| 묶음 | 지적 | 비고 |
|---|---|---|
| 13-A. 돌아갈 곳 검사 | P0-1, P2-9의 redirect 파싱 | `safe-redirect.ts`, `auth/login/page.tsx`, `auth/signup/page.tsx`. |
| 13-B. 이행 RPC가 확정 실패를 결과로 | P1-11, P2-21 | 새 마이그레이션, `fulfillment.ts`, `payments.test.ts`. |
| 13-C. 인증 흐름 | P1-1~5, P2-6~8, P2-9의 비밀번호 확인 | `auth-store.ts`, `callback/route.ts`, `LoginForm.tsx`, `reset-password/page.tsx`, `auth-errors.ts`. 결정 1. |
| 13-D. 책 상세·랜딩 | P1-6~10, P2-1~5, P2-10~18 | `detail/route.ts`, `landing/route.ts`, `explore/route.ts`(저자 맵), `BookDetailClient.tsx`·`BookDetailView.tsx`, 두 `page.tsx`. 결정 2. |
| 13-E. PDF 본문 변환 | P1-12·13, P2-19·20·22·23·24 | `pdf-generator.tsx`, `template-fallback.ts`. 12-A 뒤. |

### 묶음 13-A 계획 — 돌아갈 곳 검사

**1. 해석 결과 검사 (P0-1)** — `safeInternalPath()`가 돌려줄 pathname이 `//` 또는 `/\`로 시작하면 fallback. 검사는 해석한 뒤의 값에 함(지금 주석의 "검사한 것과 쓰는 것이 같은 문자열" 원칙 유지).

**2. 파싱 한 벌 (P2-9 일부)** — login·signup의 `safeInternalPath(redirect, "") || null`을 `safe-redirect.ts`의 `readRedirectParam(raw)` 하나로.

**3. 확인** — `safe-redirect.test.ts`에 `/..//evil.com`, `/.//evil.com`, `/%2e%2e//evil.com`, `/..\/evil.com`, 정상 경로(`/reader/{id}?x=1#y`)가 그대로인지. 고치기 전 코드에서 새 케이스가 실패하는지 먼저 봄. `npm run typecheck && npm test && npm run lint`.

### 묶음 13-B 계획 — 이행 RPC가 확정 실패를 결과로

**1. RPC (P1-11)** — 새 마이그레이션에서 `fulfill_payment`를 `CREATE OR REPLACE`. 금액·결제 키 불일치는 예외 대신 `{"outcome": "mismatch", "book_id": …}`를 돌려주고 아무것도 바꾸지 않음. `payment transaction not found`는 그대로 던짐(webhook이 이미 2xx로 닫는 경로가 따로 있음 — 확인). `service_role` GRANT는 `pg_roles` 확인 블록 그대로.

**2. 호출자** — `parseFulfillRpcResult()`가 `mismatch`를 알고, `fulfillApprovedPayment()`는 `compensate()`로 Toss 취소 → 독자에게는 "결제 정보가 맞지 않아 결제를 취소했어요". 취소도 실패하면 기존처럼 `stranded`.

**3. 모르는 모양 (P2-21)** — 결과를 읽을 수 없으면 `stranded` 대신 `deferred`로 두고 report만 남길지, 지금처럼 `stranded`로 둘지 정함. RPC가 커밋됐을 수 있으므로 **취소는 하지 않는다**는 것은 그대로.

**4. 확인** — `payments.test.ts`에 금액·키 불일치가 `mismatch`를 돌려주고 행이 바뀌지 않는지, `fulfillment.test.ts`에 `mismatch` → 취소 호출. 기존 이행·멱등 테스트 통과.

### 묶음 13-C 계획 — 인증 흐름

- **P1-2·P2-6·P2-7** — `initialize`: 구독을 맨 먼저 걸고(이벤트 유실 방지), 한 번만 돌게 플래그, `getSession`·`fetchProfile`은 catch로 로그 후 진행. `SIGNED_IN`이 같은 id면 `user` 참조를 바꾸지 않고 조회를 건너뜀.
- **P1-3·P2-8** — `fail()`이 `next`를 `redirect`로 실어 로그인 화면에 넘김(`withRedirect`). 재설정 경로의 `link_invalid`도 재설정 문구(`reset_link_invalid` 추가, `authFailureFromQuery` 허용 목록에도).
- **P1-4** — 가입 확인(`next`가 재설정이 아님)에서 `flow_state_not_found`면 "인증은 끝났을 수 있어요. 로그인해 보세요" + 로그인 동작. Supabase가 실제로 이 순서로 동작하는지(인증 후 교환 실패) 개발 프로젝트에서 한 번 확인.
- **P1-5** — 로그인 성공 뒤 `router.replace(target)` + `router.refresh()`, 성공하면 버튼을 다시 켜지 않음.
- **P1-1** — 결정 1대로.
- **P2-9 나머지** — 비밀번호 확인 검사·문구를 `auth-errors.ts`의 `checkPasswordConfirm()` 하나로.
- 확인: `auth-store` 테스트(getSession이 던져도 리스너가 붙는지, 두 번 불러도 구독 하나), 콜백 라우트 테스트, 개발 서버에서 리더 → 가입 → 만료 링크 → 다시 보내기 → 리더로 복귀.

### 묶음 13-D 계획 — 책 상세·랜딩

- **API** — 상세: `isUuid()`(P2-1), 비소유자에게는 고른 컬럼만(P1-6, 소유자는 지금처럼), `getAuthUser()` 실패는 500(P2-4, 헬퍼가 null과 실패를 구분하게), 프로필·장 병렬(P2-12), `author_bio` trim(P2-11), 테스트(P2-13). 랜딩: `nullsFirst: false` + id(P2-2), `createClient()`로(P2-3), 캐시는 결정 2(P2-5). 저자 맵은 `lib/`로 옮겨 explore와 같이 씀(P2-10).
- **화면** — 판정 전·실패 상태를 따로 그림(P1-7), 목차 분량은 결정 2(P1-8), viewAs면 접근 정보를 `checkBookAccess`의 비구매자 판정으로 바꿔 그림(P1-9: 유료면 `preview`, 무료면 `free`), 쿼리 키에 `user?.id ?? "anon"`과 access 이펙트 의존성(P1-10), 소유자 표시 문구(P2-14), 메타데이터 error 처리(P2-15·P2-16), 공유 버튼(P2-17), 전환 뒤 관련 쿼리 무효화(P2-18).
- 확인: 상세 라우트 테스트(익명·비UUID·인증 실패), 화면 테스트(판정 전·실패·viewAs), 개발 서버에서 유료 책을 구매자·비구매자·저자(viewAs)로.

### 묶음 13-E 계획 — PDF 본문 변환

- **P1-12** — 인라인 태그를 "아는 블록 태그가 아니면 인라인"으로 뒤집어, 모르는 태그는 공백 없이 풂. `code`는 고정폭 폰트가 없으므로 배경색으로 구분(이탤릭·이모지 금지 규칙).
- **P1-13** — `img`는 대체 글을 `[그림: …]`으로, 대체 글이 없으면 `[그림]`. 캡션(`figcaption`)은 문단으로. 이미지를 PDF에 넣는 것은 범위 밖(따로 정함).
- **P2-19·P2-20** — `br`은 접기 전에 줄 단위로 나눠 보존, 블록 분할은 정규식 대신 이미 쓰는 DOM 파서(`html-dom-parser`)로.
- **P2-22·P2-23·P2-24** — 장별 파싱 결과를 두 렌더가 공유, 엔티티 디코더는 `template-fallback.ts`에서 export, 문구는 "표지"·"목차".
- 확인: `pdf-generator.test.tsx`에 `code`·`sub`·`br`·중첩 인용·`img` 케이스, `pdf-fallback-glyphs.test.ts`(새 문자 `[`·`]` 포함), 실제 원고로 PDF를 만들어 눈으로.

## 결정이 필요한 것

1. **비밀번호 재설정 화면이 받을 세션 (P1-1, 13-C).** 지금은 로그인 세션이면 누구나 현재 비밀번호 없이 바꿀 수 있어요. 화면만 막아도 `supabase.auth.updateUser()`는 브라우저에서 직접 부를 수 있으니 진짜 경계는 Supabase예요. 비교한 것:
   - **Supabase 대시보드 "Secure password change" 켜기 (권장)**: 마지막 로그인이 24시간보다 오래면 재인증(nonce)을 요구해요. 재설정 메일로 막 만든 세션은 새것이라 그대로 통과하고, 공용 기기에 오래 남은 세션은 막혀요. 코드는 `reauthentication_needed` 에러를 `toAuthFailure()`에 더하는 정도.
   - 콜백이 재설정 경로일 때만 짧은 httpOnly 쿠키를 심고 화면이 그것을 요구: 화면 진입은 막지만 콘솔에서 `updateUser`를 부르는 것은 못 막아요. 보조로만.
   - 둘 다 하지 않기: 로그인된 기기를 쥔 사람은 이미 많은 것을 할 수 있다는 판단. 다만 비밀번호를 바꾸면 계정 자체를 가져가므로 권장하지 않아요.
2. **목차 분량과 랜딩 캐시 (P1-8·P2-5, 13-D).**
   - 목차 분량: `estimated_reading_time`을 장 저장 때 채울지(한국어는 글자 수 ÷ 분당 500자 정도), 아니면 지금 값을 "어절"로 바꿔 보일지. **권장: 읽는 시간("약 6분")** — 독자가 묻는 것은 분량이 아니라 시간이고, 리더 헤더도 이미 이 값을 쓰려고 기다려요. 저장 때 계산하면 마이그레이션 없이 앱에서 채우되, 기존 장은 한 번 채워야 해요(스크립트 또는 다음 저장 때).
   - 랜딩 캐시: 라우트를 `dynamic = "force-dynamic"`으로 하고 응답에 `Cache-Control: s-maxage=300, stale-while-revalidate`를 붙이는 것을 권장해요. 빌드 시점에 DB를 부르지 않고, CDN이 5분 캐시해요.
