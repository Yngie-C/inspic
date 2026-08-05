# Inspic MVP 재구성 TODO

전체 계획과 마일스톤 정의는 `README.md`를 보세요. 이 문서는 진행 중인 마일스톤의 작업 목록입니다.

---

## M0 — 결정과 삭제 ✅ 완료 (2026-08-04)

- [x] `pre-mvp-archive` 태그 생성 (롤백 지점)
- [x] MVP 범위 밖 코드 전량 삭제 — TTS/오디오북, 죽은 리더 서브시스템, 시리즈, 알림, i18n, AI 보조, 협업, 리뷰·팔로우, 워크북 템플릿 7종
- [x] 중복 라우트 통합 — `/studio` → `/creator` 리다이렉트, Header 링크 정리
- [x] 끊어진 링크 수정 — `/editor/:id` → `/create/edit/:id`, 리더 뒤로가기 `/dashboard` → `/my/library`
- [x] 미들웨어 보호 라우트 정리 + 검증 없는 `getSession()` 폴백 제거
- [x] 미사용 의존성 제거 (`lamejs`, `next-intl`)
- [x] README·AGENTS.md를 실제 코드와 일치시킴
- [x] 게이트: typecheck 에러 0, build 통과

**결과**: 29,024줄 → 14,311줄 (−51%), 파일 256 → 146, API 45 → 17

**미해소**: lint 에러 13개. 전부 재구성 이전부터 존재하던 React Compiler 부채이며 삭제 작업과 무관합니다. 별도 정리 필요.

---

## 확정된 결정

| 항목 | 결정 | 확정일 |
|---|---|---|
| 핵심 베팅 | 인터랙티브 워크북 | 2026-08-04 |
| 첫 사용자 | 소수 저자 영입 + 본인 콘텐츠 병행 | 2026-08-04 |
| 코드 접근 | 1안 — 기존 레포 안에서의 재설계 | 2026-08-04 |
| TTS/오디오북 | 완전 삭제 | 2026-08-04 |
| **Supabase 실사용 데이터** | **없음 → 마이그레이션 통합 리셋 가능** | 2026-08-04 |
| 개발 속도 | 제약 아님. 게이트 통과가 우선 | 2026-08-04 |

---

## M1 — 도메인 재설계 ✅ 완료 (2026-08-04)

**게이트**: 마이그레이션이 빈 DB에 적용된다 ✅ · 응답 저장/복원 단위 테스트 통과 ✅ · 크리에이터가 문항을 추가/삭제해도 기존 응답이 보존되는 시나리오 테스트 통과 ✅

### 스키마 — 통합 리셋

- [x] `supabase/migrations/` 기존 8개 파일을 단일 초기 스키마(`00001_initial_schema.sql`)로 교체
- [x] 범위 밖 테이블 제외 (오디오북·리더 서브시스템·시리즈·알림·소셜·구독 전량)
- [x] 유지: `user_profiles`, `books`, `chapters`, `purchases`, `payment_transactions`
- [x] 새 스키마가 빈 DB에 적용되는지 검증 — 임베디드 Postgres(PGlite) 테스트 12개
- [x] **`workbook_blocks`** — 블록 정의. `id`는 DB가 만들지 않고 에디터의 `data-node-id`를 그대로 받음
- [x] **`workbook_block_fields`** — 블록 안의 개별 문항. `(block_id, field_key)` 유일
- [x] **`workbook_responses`** — `(user_id, block_id, field_key)` 단위. 값은 타입별 컬럼(`value_text`/`value_number`/`value_bool`)에 하나만
- [x] RLS: 응답은 작성자 본인만. 크리에이터는 `workbook_response_stats()` 집계 함수로만 조회
- [x] `books.content_type` 제거 + 코드 참조 전량 정리

### 인증

- [x] `user_profiles` 생성을 `auth.users` INSERT 트리거(`handle_new_user`)로 이관
- [x] `user_profiles`에 INSERT 정책을 두지 않아 생성 경로를 트리거 하나로 고정
- [x] `auth-store.ts`의 클라이언트 프로필 생성 경로 2개 제거 (`signUp`, `onAuthStateChange`)

### 블록 ID 규약

- [x] `BaseTemplateNode.ts`의 `parseHTML: ... || generateNodeId()` 폴백 제거
- [x] 블록이 문서에 들어올 때 1회 부여하는 ProseMirror 플러그인 추가 (복사·붙여넣기 중복 ID도 분리)
- [x] 체크리스트 항목에 안정 ID 도입 — 배열 인덱스 대신 항목 ID가 `field_key`

### 응답을 정의에서 분리

- [x] `data-*` 속성에서 독자 응답을 전량 제거: 스케일 `data-value`, SMART 목표 `data-fields`, 체크리스트 항목의 `checked`
- [x] 저작 화면의 해당 입력은 미리보기로 변경 (독자가 채우는 칸)
- [x] `data-template-type` 이름 불일치 수정 — 에디터 `smartGoal` ↔ 리더·내보내기 `smart-goal` (SMART 블록이 리더에서 인터랙티브로 안 뜨던 버그)

### 테스트 도입

- [x] Vitest + React Testing Library 설정 (`npm test`)
- [x] `lib/sanitize.ts` 테스트 26개 — script/이벤트 핸들러 제거, 허용 태그 유지, `data-*` 보존, checkbox 외 input 제거
- [x] `lib/access-control.ts` 테스트 8개 — owner / 무료공개 / 비공개 / 미발행 / 구매자 / 비구매자 / 비로그인
- [x] 워크북 응답 저장·복원 테스트 — 문항 추가·삭제·순서변경·텍스트 수정 후 응답 보존
- [x] 스키마 테스트 12개 — 마이그레이션 적용, 구조, 트리거, 제약
- [x] RLS 동작 테스트 40개 — 정책이 실제로 무엇을 막는지 (아래)

### RLS 동작 검증

임베디드 Postgres에서 `SET ROLE`로 실제 롤을 갈아타며 확인합니다. 하네스는 `src/lib/supabase/__tests__/harness.ts`.

- [x] 유료 책: 비구매자·비로그인은 챕터도 문항도 못 읽고, 구매자만 읽음
- [x] 미발행 챕터는 구매자에게도 안 보이고 소유자만 봄
- [x] 응답은 작성자 본인만 읽기/수정/삭제. 크리에이터도 원문 조회 불가
- [x] 사칭 INSERT(남의 `user_id`)와 무권한 책 응답 INSERT 거부
- [x] `workbook_response_stats()`는 소유자만 실행, 반환 컬럼에 응답 원문 없음
- [x] `user_profiles` 직접 INSERT 거부 (생성 경로는 트리거뿐)
- [x] 남의 이름으로 `purchases` INSERT 거부 (무료 열람 우회 차단)
- [x] 하네스 자체 점검 — 롤 전환이 실제로 걸리는지, 소유자 연결 대조군으로 검증이 헛돌지 않는지
- [x] 뮤테이션 점검 — 정책을 일부러 열었을 때 해당 테스트가 실제로 깨지는 것 확인

**결과**: 테스트 119개 통과. typecheck 0 에러, build 통과. lint 에러 13 → 11 (남은 것은 전부 재구성 이전 부채).

**실제 Supabase 적용**: 2026-08-05 완료. `00001_initial_schema.sql`을 SQL 에디터로 적용했습니다.

---

## M2 — 워크북 저작 (크리에이터 루프) ✅ 완료 (2026-08-05)

**게이트**: 원고 업로드 → 워크북 블록 5종 삽입 → 미리보기 → 공개까지 막힘 없이 완주

### 블록 정의 동기화 — M2의 핵심

M1에서 만든 `extractWorkbookBlocks()`가 어디에도 연결돼 있지 않았습니다. 이제 챕터를 저장하면 정의가 DB에 반영됩니다.

- [x] `sync_chapter_workbook_blocks(chapter_id, blocks)` RPC — 마이그레이션 `00002`
- [x] upsert + 삭제를 **한 트랜잭션**으로 처리 (여러 왕복으로 나누면 중간 실패 시 블록은 새 정의, 문항은 옛 정의로 남음)
- [x] `SECURITY INVOKER` — 권한 판정은 RLS가. 소유자 확인은 조용한 0행 대신 분명한 에러를 내기 위한 것
- [x] `src/lib/workbook/sync-blocks.ts` — 추출 → 저장 가능한 블록만 걸러 RPC 호출
- [x] `POST /api/chapters` · `PUT /api/chapters/[chapterId]` · `POST /api/upload`에 연결
- [x] 동기화 실패해도 던지지 않음 — 챕터 본문은 이미 저장된 뒤라 여기서 던지면 글이 날아간 것처럼 보임. 대신 응답에 `workbook_sync`를 싣고 공개 전 검수가 차단

### 이미지 저장소

- [x] `chapter-images` 버킷 + Storage RLS 정책 (마이그레이션 `00002`)
- [x] `POST /api/books/[bookId]/images` — 경로 `{bookId}/{chapterId}/{임의값}.{확장자}`
- [x] `RichTextEditor`의 base64 인라인 제거 → URL만 본문에 삽입
- [x] 업로드 중·실패 상태를 에디터 하단에 표시 (이전에는 조용히 실패)

### 업로드 파서 분리

- [x] `src/lib/upload-parser.ts`로 분리 — 라우트는 검증과 저장만
- [x] 테스트 20개 — 확장자 판정, 챕터 경계, 제목 추출, 워크북 블록의 `data-*` 보존

### 공개 전 검수

- [x] `src/lib/publish-checks.ts` (순수 판정) + `publish-checks-loader.ts` (DB 조회)
- [x] 차단: 제목 없음 · 챕터 없음 · 빈 챕터 · **응답을 받을 수 없는 블록** · **DB에 저장되지 않은 블록**
- [x] 경고: 워크북 블록 없음 · 미발행 챕터 · base64 인라인 이미지 · 표지 없음 · 소개글 없음
- [x] `GET /api/books/[bookId]/publish-checks` + 미리보기 화면의 검수 패널
- [x] `PUT /api/books/[bookId]`가 출간 전환 시 차단 항목을 서버에서 재검사 (422)
- [x] 편집 화면의 "출판" → "검수 후 공개" — 미리보기를 거쳐야 공개됨

### 함께 고친 것

- [x] **출간해도 아무도 볼 수 없던 문제** — `handlePublish`가 `status`만 바꾸고 `visibility`는 `private`으로 남겼습니다. 이제 공개 시 `visibility: public`을 함께 보냅니다
- [x] `published_at`을 서버가 찍습니다 (비어 있을 때만 — 내렸다 다시 올려도 최초 출간일이 밀리지 않게)
- [x] `countWorkbookBlockElements()` 추가 — `data-node-id`가 없는 블록은 추출 단계에서 버려져 검수가 볼 수 없었습니다
- [x] 워크북 블록만 있는 챕터를 "빈 챕터"로 오판하던 것
- [x] `countWords` 중복 3곳 → `src/lib/content-stats.ts`
- [x] 테스트 하네스가 마이그레이션을 파일명 순서대로 전부 적용 + `storage` 스키마 스텁

### 테스트

- [x] `workbook-sync.test.ts` 16개 — 실제 Postgres에서 RLS를 켠 채로. **정의가 어떻게 바뀌어도 응답은 지워지지 않는다**를 문항 추가/삭제/부활/블록 삭제/순서 변경/챕터 이동으로 확인
- [x] `sync-blocks.test.ts` 10개 — node 환경 (API 라우트가 도는 곳). HTML 파싱은 브라우저와 서버가 다른 구현을 씀
- [x] `publish-checks.test.ts` 15개 · `upload-parser.test.ts` 20개

**결과**: 테스트 121 → 182개 통과. typecheck 0 에러, build 통과. lint 에러 11 → 10 (전부 재구성 이전 부채).

**적용 필요**: `supabase/migrations/00002_workbook_block_sync.sql`을 Supabase에 적용해야 동작합니다. 적용 전에는 챕터 저장 시 블록 정의가 반영되지 않고(응답에 `workbook_sync.ok: false`), 본문 이미지 업로드가 실패합니다.

---

## M3 — 워크북 독서 (독자 루프) ✅ 완료 (2026-08-05)

**게이트**: 기기 A에서 작성 → 기기 B에서 이어서 작성이 동작한다 ✅ · 크리에이터가 챕터를 수정·재발행해도 독자 응답이 유지된다 ✅

여기서 처음으로 제품이 존재합니다. M1이 스키마를, M2가 저작 측 쓰기를 붙였고, 이제 독자가 쓴 답이 계정에 남습니다.

### 응답이 DB로 — M3의 핵심

- [x] `POST`가 아니라 `PUT /api/books/[bookId]/responses` — 응답은 문항당 하나뿐이라 멱등한 upsert입니다
- [x] `GET /api/books/[bookId]/responses` — 내가 이 책에 쓴 응답 전부. 리더가 열 때 한 번
- [x] **`chapter_id`와 값 컬럼을 클라이언트가 정하지 않습니다.** 서버가 `workbook_block_fields` / `workbook_blocks`에서 읽어 결정합니다 — 정의가 DB에 없는 블록에는 응답이 매달리지 않고, 남의 챕터 ID를 실어 보낼 수도 없습니다
- [x] `src/lib/workbook/response-payload.ts` — payload 검증(순수) + 정의로 행 조립
- [x] 길이·타입 제약을 DB보다 먼저 검사 — CHECK에 걸리면 배치 전체가 실패해 함께 쓴 답까지 날아갑니다
- [x] 한 건이 잘못돼도 나머지는 저장. 빠진 것은 `rejected`로 돌려주고 리더가 "저장 실패"로 표시
- [x] 빈 문자열은 미응답(null)으로 정규화 — 그대로 저장하면 크리에이터가 보는 참여율이 부풀려집니다. 체크 해제(`false`)는 값으로 남깁니다

### 리더 재작성

- [x] `WorkbookResponsesProvider` — 책 단위로 한 번 불러오고, 낙관적 업데이트 + 600ms 디바운스 배치 저장
- [x] 저장 상태 표시: 저장 중 / 저장됨 / 저장 실패·다시 시도 / 이 기기에만 저장됨
- [x] `localStorage`는 오프라인 캐시로 강등. **서버 값이 캐시를 이깁니다** — 아니면 옛 기기의 답이 되살아납니다
- [x] 탭을 닫을 때 `pagehide`에서 남은 배치를 `keepalive`로 밀어 넣음 (디바운스 안에 떠나면 사라지던 입력)
- [x] `useBlockAnswers`가 `chapterId`를 받지 않습니다 — 응답의 정체성에 챕터가 들어가지 않고, 서버가 정의에서 읽습니다
- [x] provider 없이 워크북 블록을 그리면 던집니다. 저장되는 줄 알았는데 아니었던 것이 이 화면에서 가장 나쁜 실패입니다
- [x] 하드코딩된 `fontSize`/`theme`/`lineHeight` 제거 + 쓰이지 않던 `ReaderTheme`·`ReaderPreferences` 타입 삭제
- [x] 비로그인·미구매·챕터 없음을 각각 안내 (이전에는 전부 "읽을 수 있는 챕터가 없습니다")
- [x] 책 조회를 2회 → 1회로 (`GET /api/books/[bookId]`가 이미 챕터를 함께 돌려줍니다)

### 함께 고친 것

- [x] **로그인 후 돌아오지 못하던 것** — 리더에서 로그인하면 `/dashboard`로 떨어졌습니다. `?redirect=`를 이메일·OAuth 양쪽에 연결했습니다 (`/auth/callback`의 `next`는 이미 있었음)
- [x] `src/lib/safe-redirect.ts` — 오픈 리다이렉트 차단 규칙을 로그인 화면과 콜백이 함께 씁니다
- [x] `value_number`(NUMERIC)를 API 경계에서 숫자로 정규화 — 문자열로 흘러가면 스케일 응답이 조용히 미응답으로 보입니다

### 결정한 것

**블록 정의는 리더도 계속 HTML에서 뽑습니다.** 화면에 무엇이 어디 있는지는 본문 HTML이 정하고(블록은 문단 사이에 박혀 있습니다), DB 정의는 **저장할 때** 서버가 판정 기준으로 씁니다. 둘을 다 DB에서 읽으면 본문과 정의가 어긋났을 때 화면이 비고, 그건 공개 전 검수가 이미 막는 상태입니다.

### 테스트

- [x] `response-payload.test.ts` 15개 — 검증·정규화·행 조립, 한 건 실패가 배치를 죽이지 않는지
- [x] `WorkbookResponses.test.tsx` 9개 — 서버 값이 캐시를 이기는지, 낙관적 업데이트, 실패해도 값이 남는지, 다시 시도, provider 없이 그리면 던지는지
- [x] `ChecklistReader.test.tsx` 6개 — 응답을 인덱스가 아니라 `field_key`로 붙이는지 (실제 Postgres 아닌 화면 단에서 한 번 더)
- [x] `workbook-responses.test.ts` 12개 — PGlite에서 RLS를 켠 채 왕복. 기기 간 이어쓰기, 독자 간 격리, 크리에이터의 원문 조회 차단, 정의 삭제·부활 후 보존
- [x] 뮤테이션 점검 — 캐시가 서버를 이기게, 응답을 인덱스로 매칭하게 일부러 바꿨을 때 해당 테스트가 실제로 깨지는 것 확인

**결과**: 테스트 182 → 220개 통과. typecheck 0 에러, build 통과. lint 에러 10개로 동일 (전부 재구성 이전 부채).

**마이그레이션**: 추가 없음. M1의 `workbook_responses`를 그대로 씁니다.

---

## M4 — 판매와 접근 제어 ✅ 완료 (2026-08-05)

**게이트**: 성공·실패·중복·창닫음 4개 시나리오 검증 ✅ · **승인은 됐는데 구매 기록이 없는 상태가 재현되지 않는다** ✅

M3까지는 "돈을 받는 부분"만 있고 "받은 뒤를 책임지는 부분"이 없었습니다. 승인 뒤 어디서 끊겨도 구매가 생기거나 돈이 돌아가게 만드는 것이 M4입니다.

### 구매 기록의 생성 경로를 서버로 고정 — 먼저 막아야 했던 것

- [x] **`purchases_insert_own` 정책 삭제.** `auth.uid() = user_id`만 봤기 때문에, 로그인한 사용자가 **자기 이름으로** 행을 하나 넣으면 유료 책이 그대로 열렸습니다. `has_book_access()`가 `purchases`를 보고 판정하기 때문입니다. M1 테스트는 *남의* 이름으로 넣는 것만 막혀 있는지 봤습니다
- [x] `payment_transactions_update_own` 정책도 삭제 — 클라이언트가 자기 결제를 `done`으로 고쳐 쓸 이유가 없습니다
- [x] 이제 구매를 만들 수 있는 것은 승인을 확인한 서버뿐입니다 (`user_profiles`를 트리거 하나로 고정한 것과 같은 방식)

### 이행과 보상 — M4의 핵심

- [x] `fulfill_payment(order_id, payment_key, amount, method, raw)` RPC — 마이그레이션 `00003`
- [x] 구매 upsert + 결제 행 갱신 + 둘의 연결을 **한 트랜잭션**으로. 나눠서 왕복하면 중간에 끊겼을 때 정확히 "돈은 받았는데 구매가 없는" 상태가 남습니다
- [x] 멱등 — 같은 주문을 두 번 이행해도 구매는 하나(`already_fulfilled`). 성공 화면 새로고침과 webhook이 겹치는 것이 정상 경로입니다
- [x] `FOR UPDATE`로 잠급니다. 안 잠그면 둘 다 "구매 없음"을 보고 각자 만들려 듭니다
- [x] 승인 금액은 클라이언트가 보낸 값이 아니라 **Toss가 승인한 값**을 씁니다. 요청 시점에 잠근 금액과 다르면 반영하지 않습니다
- [x] `ON CONFLICT (user_id, book_id) DO UPDATE` — `UNIQUE`가 재구매를 막던 것을 풀었습니다. 환불했다가 다시 사는 경로가 살아 있어야 합니다
- [x] 중복 결제(`duplicate_purchase`)는 **아무것도 바꾸지 않고 알려만 줍니다.** 조용히 덮으면 독자는 두 번 내고 한 권을 받습니다
- [x] `src/lib/payments/fulfillment.ts` — 이행 실패·중복이면 **Toss 결제를 취소**하고, 취소까지 실패하면 `stranded`로 남겨 사람이 보게 합니다. 성공인 척하지 않습니다
- [x] `void_payment(order_id, status, raw)` — 취소·만료를 결제 행과 구매 상태에 반영. 전액 취소는 `refunded`로 접근을 닫고, 부분 취소는 유지합니다

### webhook — 창을 닫아도 결제가 유실되지 않게

- [x] `POST /api/payments/webhook` — confirm이 유일한 이행 경로면 승인 직후 창을 닫는 순간 결제와 구매가 갈라집니다
- [x] **본문을 믿지 않습니다.** 꺼내는 것은 주문번호뿐이고 나머지는 Toss에 다시 물어 확인합니다 — 위조한 본문으로는 결제를 만들 수 없습니다
- [x] `TOSS_WEBHOOK_SECRET`(선택)으로 모르는 곳의 요청을 일찍 끊습니다. 방어의 본체는 재조회입니다
- [x] 이행하지 못한 것에만 5xx — Toss는 2xx가 아니면 재시도하므로, 판단해서 넘긴 것까지 재시도를 받으면 같은 요청이 계속 돌아옵니다

### confirm 재작성

- [x] `ALREADY_PROCESSED_PAYMENT`를 실패로 보지 않습니다. **예전 구현은 이것을 승인 실패로 보고 멀쩡히 끝난 결제를 `aborted`로 덮었습니다** — 새로고침 한 번이면 재현됐습니다
- [x] 이미 이행된 주문은 Toss를 부르지 않고 그대로 돌려줍니다. `status = 'done'`을 함께 보는 것은 환불 때문입니다 (취소된 결제도 `purchase_id`는 달고 있습니다)
- [x] 권한은 세션으로, 쓰기는 admin으로. 결제 행을 세션 클라이언트로 읽는 것 자체가 소유 확인입니다(RLS상 자기 결제만 보임)
- [x] 자동 취소된 결제를 붉은 실패 화면으로 보여 주지 않습니다 — 돈이 묶인 줄 알고 다시 결제합니다

### 접근 제어 — 첫 챕터 미리보기, 비로그인 열람

- [x] `chapters_select_preview` 정책 — 공개 발행본의 **맨 앞 published 챕터 하나**는 누구나(비로그인 포함) 읽습니다. 판정은 `book_preview_chapter_id()`로 빼서 정책이 `chapters`를 재귀 평가하지 않게 했습니다
- [x] 워크북 블록 정의는 열지 않습니다. 리더가 블록을 본문 HTML에서 뽑으므로 화면은 그대로 그려지고, 응답은 `has_book_access`가 막습니다
- [x] `checkBookAccess`가 `{ hasAccess, reason, canRead, canSaveResponses }`를 돌려줍니다 — "읽을 수 있는가"와 "답이 계정에 남는가"는 다른 질문입니다
- [x] 미들웨어의 `/reader` 보호 해제. 무엇을 보여 줄지는 리더가 정하고 차단은 RLS가 합니다
- [x] 리더가 미리보기·비로그인 상태를 각각 안내하고, 저장되지 않는 동안에는 화면이 계속 그렇게 말합니다

### 함께 고친 것

- [x] **응답 캐시가 사용자별로 나뉘지 않던 것** — 키가 `inspic_workbook:{bookId}`뿐이었습니다. 비로그인 열람을 열면서 "익명으로 쓴 답이 로그인 화면에 저장된 것처럼 떠오르지만 서버로는 안 가는" 경로가 생겼습니다. 키에 보는 사람을 넣었습니다
- [x] **`.env.example`의 Toss 클라이언트 키 이름이 틀린 것** — 코드는 `NEXT_PUBLIC_TOSS_CLIENT_KEY`를 읽는데 예시는 `TOSS_CLIENT_KEY`였습니다. 그대로 채우면 결제 위젯이 뜨지 않습니다
- [x] `TOSS_SECRET_KEY`를 모듈 로드 시점이 아니라 쓸 때 읽습니다 (`!`로 단정하면 키 없는 환경에서 import만으로 터집니다)
- [x] 결제 완료 화면의 "내 서재로 이동"이 없는 경로(`/library`)를 가리키던 것
- [x] 결제 화면에서 로그인이 필요할 때 `?redirect=`가 없어 홈으로 떨어지던 것

### 테스트

- [x] `supabase/__tests__/payments.test.ts` 22개 — PGlite에서 RLS를 켠 채. 4개 시나리오(성공·검증 실패·중복·창닫음), 재구매, 취소 후 접근 차단, **자기 이름 `purchases` INSERT 차단**, `fulfill_payment`/`void_payment`를 로그인 사용자가 부를 수 없음
- [x] `lib/payments/fulfillment.test.ts` 13개 — 실제 결제로 재현하기 어려운 보상 경로. 이행 실패 → 취소, 중복 → 취소, 취소까지 실패 → `stranded`
- [x] `lib/payments/status.test.ts` 12개 — 모르는 상태를 승인으로도 취소로도 넘겨짚지 않는지
- [x] `rls.test.ts` +5개 — 미리보기가 **첫 챕터 하나로 제한**되는지, 미발행·비공개는 열리지 않는지, 미리보기 챕터의 워크북 문항은 닫혀 있는지
- [x] `access-control.test.ts` 재작성 — `canRead`/`canSaveResponses`가 각각 무엇을 정하는지
- [x] 뮤테이션 점검 9개 — 정책을 되살리고, 멱등을 풀고, 취소를 건너뛰고, 미리보기 제한을 없애고, 캐시 칸을 합쳤을 때 해당 테스트가 실제로 깨지는 것 확인. **이 과정에서 캐시 테스트가 키를 손으로 만들어 헛돌던 것을 발견해 프로덕션 저장 경로를 쓰도록 고쳤습니다**

**결과**: 테스트 220 → 275개 통과. typecheck 0 에러, build 통과. lint 에러 10개로 동일 (전부 재구성 이전 부채).

**적용 필요**: `supabase/migrations/00003_payment_integrity.sql`을 Supabase에 적용해야 동작합니다. 적용 전에는 결제 승인이 구매로 이어지지 않고(`fulfill_payment` 없음), 첫 챕터 미리보기도 열리지 않습니다.

**남긴 것**: 실제 Toss 테스트 결제로 4개 시나리오를 손으로 밟는 것은 키가 있어야 합니다. DB·보상 로직은 위 테스트가 덮고 있으므로, 남은 것은 Toss와의 실제 왕복 확인입니다.

---

## 이후 마일스톤

M5(응답 회수) · M6(실사용 검증)

M5에서 이어받을 것:
- 미리보기(`PreviewFrame`)는 리더를 그대로 띄웁니다. 크리에이터가 자기 책을 미리보며 입력하면 자기 응답으로 저장됩니다 — 의도한 동작이지만, `workbook_response_stats()` 집계에서 소유자를 뺄지 정해야 합니다
- 고아 응답(`orphanedResponses()`)을 "내 워크북"과 내보내기에서 어떻게 보여 줄지
- 미리보기에서 쓴 답(익명 캐시)을 구매·로그인 후 옮겨 줄지. 지금은 칸이 나뉘어 있고 옮기지 않습니다 — 조용히 옮기면 어디서 온 값인지 알 수 없어집니다

각 마일스톤의 범위와 게이트는 `README.md` 참조.

---

## 상시 규칙

- M0~M5 동안 README·이 문서에 없는 기능은 추가하지 않습니다.
- 각 마일스톤 종료 시 `npm run typecheck && npm run build && npm test`를 통과해야 합니다.
- 워크북 데이터 모델을 만질 때는 `AGENTS.md`의 "워크북 데이터 모델" 절을 먼저 읽으세요.
