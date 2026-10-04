# 7단계 리뷰 결과 — 조회·분석 API

- 날짜: 2026-10-04
- 실행 (경로마다 따로, 워크트리 `orca/workspaces/inspic/code-review`):
  ```
  /code-review medium src/app/api/analytics
  /code-review medium src/app/api/my
  /code-review medium src/app/api/explore
  /code-review medium src/app/api/landing
  /code-review medium src/app/api/books/[bookId]/detail
  /code-review medium src/app/api/books/route.ts
  ```
- 대상 커밋: `8cbf0b9` (여섯 경로 모두 `main`과 diff가 없어 파일 전체를 검토)
- 원 지적 25건(analytics 6 · my 5 · explore 5 · landing 1 · detail 4 · books 4). 같은 원인을 합쳐 **22건 (P0 0 · P1 9 · P2 13)**.
  - 저자 이름 조회 오류 무시(explore·landing·detail)는 P2-1 하나로 합쳤어요.
  - 1000건 잘림은 파일마다 따로 셌어요(고칠 곳이 다르므로).
- **검증 상태**
  - 직접 대조함: 7개 라우트 전체를 읽고 지적 위치와 줄 번호 확인. P1-8은 `chapters_select`(00001)·`chapters_select_preview`(00003)와, P2-9는 `workbook_blocks_select`(00008 `can_read_workbook_block`)와 대조.
  - 테스트·앱 확인은 하지 않았어요. 일곱 라우트 모두 라우트 테스트가 없어요.

계획은 [code-review-plan.md](../code-review-plan.md), 이전 결과는 [05-security-inputs.md](05-security-inputs.md)를 보세요.

## 공통 원인 두 가지

1. **조회 오류를 정상 응답으로 낸다.** supabase-js는 실패를 던지지 않고 `error`로 돌려주는데, `data ?? []`로 넘겨 200이 나가요. 매출 0원, "답한 사람 없음", "공개된 장 없음"이 실제 결과처럼 보여요. `landing/route.ts:77-80`의 책 조회만 이미 막고 있어요.
2. **1000건에서 잘린다.** PostgREST `max_rows`(1000)를 넘으면 조용히 잘려요. `responses`·`pdf` 라우트와 `publish-checks-loader.ts`는 이미 1000건씩 끝까지 읽어요(같은 반복문이 세 벌).

## P1

| # | 위치 | 지적 |
|---|---|---|
| P1-1 | `analytics/sales/route.ts:11`, `:27` | `books`·`purchases` 조회 오류를 확인하지 않음 → 판매가 있는 저자에게 "0원 / 0건"이 200으로 나감. |
| P1-2 | `analytics/sales/route.ts:27` | 구매를 한 번에 읽어 1000건에서 잘림 → 판매 건수·매출이 덜 셈. |
| P1-3 | `analytics/workbook/route.ts:40` | `chapters`·`workbook_blocks` 오류를 버림(`statsError`만 확인) → "아무도 답하지 않음"·"블록 없음"이 200. |
| P1-4 | `analytics/workbook/route.ts:42`, `:47` | 블록과 `workbook_response_stats` RPC가 1000행에서 잘림 → 큰 책에서 블록이 빠지고, 답한 문항이 0으로 나와 거짓 이탈 지점이 생김. |
| P1-5 | `my/workbooks/route.ts:32` | 응답을 한 번에 읽어 1000건에서 잘림 → 답이 많은 독자는 책이 목록에서 빠지거나 진행률이 낮게 나옴. |
| P1-6 | `my/workbooks/route.ts:46`, `:55` | `books`·`workbook_blocks`·`user_profiles` 오류를 버림 → "쓴 워크북 없음"이나 `total_fields` 0이 200으로 나가고 화면의 `isError`·재시도가 동작하지 않음. 블록도 1000개에서 잘림. |
| P1-7 | `explore/route.ts:37-39` | 검색어를 이스케이프하지 않고 `.or()`에 넣음 → `C++, Python`처럼 쉼표·괄호가 있으면 500, 조작한 `q`로 OR 조건 추가 가능(공개 상태 필터는 별도라 비공개 책은 안 샘). `%`·`_`가 와일드카드로 동작. |
| P1-8 | `books/[bookId]/detail/route.ts:46` | 비구매자는 RLS상 미리보기 장 하나만 읽음 → 유료 책 상세에 "구성 12장"인데 목차는 1장. 사려는 사람이 목차를 볼 수 없음. |
| P1-9 | `books/[bookId]/detail/route.ts:50` | `chapters` 오류를 버림 → 구매자에게도 "아직 공개된 장이 없어요"가 200. |

## P2

| # | 위치 | 지적 |
|---|---|---|
| P2-1 | `explore/route.ts:77` · `landing/route.ts:34` · `detail/route.ts:29` | `user_profiles` 오류를 버려 저자 이름이 전부 `null`로 200. landing은 이 응답이 5분 캐시됨. |
| P2-2 | `analytics/workbook/route.ts:29` | 소유 확인 조회 오류(일시 장애, UUID 아닌 `bookId`의 22P02)가 404 "Book not found". |
| P2-3 | `detail/route.ts:20` | 책 조회의 모든 오류가 404. 없음(PGRST116)만 404여야 함 → 결제 화면에서 일시 장애가 "삭제됐거나 권한 없음"으로 보임. |
| P2-4 | `my/workbooks/route.ts:90` | `last_written_at`·정렬에 `updated_at` 사용 → repoint·장 삭제로도 올라 몇 달 전 책이 맨 위로. `written_at`(00008)을 쓰고 빈 예전 행만 `updated_at`으로. |
| P2-5 | `explore/route.ts:11` | 숫자가 아닌 `page`·`per_page`가 NaN → `.range(NaN, NaN)`로 500. |
| P2-6 | `explore/route.ts:33` | `author_id`를 UUID로 확인하지 않아 22P02 원문이 500으로 나감(작가 페이지가 URL 값을 그대로 넘김). |
| P2-7 | `explore/route.ts:53-64` | 정렬에 유일한 마지막 기준이 없음 → 무료 책끼리(가격 0) 등 동률에서 페이지가 겹치거나 빠짐. `newest`는 `published_at` NULL이 맨 앞. |
| P2-8 | `detail/route.ts:26` | 서버가 `viewAs=customer`를 모름 → 저자가 독자 화면으로 볼 때 draft 장 제목이 목차에 섞임. |
| P2-9 | `my/workbooks/route.ts:57` | 블록은 `has_book_access`가 있어야 읽힘 → 환불 등으로 접근을 잃은 공개 유료 책은 목록에 뜨되 진행률 0/0. |
| P2-10 | `books/route.ts:47` | POST 본문이 JSON `null`이면 구조 분해에서 TypeError → 500. PUT은 `readJsonObject()`로 400. |
| P2-11 | `books/route.ts:70` | `price`가 정수인지·상한을 보지 않음 → `9900.5`·`1e12`가 DB에서 거절돼 Postgres 원문 500. |
| P2-12 | `books/route.ts:66` | `language`를 `BOOK_LANGUAGES`와 대조하지 않음 → 아무 값이나 저장되고, PUT은 같은 값이면 받아 줘서 고칠 길이 없음. |
| P2-13 | `books/route.ts:65` | `description` 타입 미확인·공백을 null로 바꾸지 않음 → PUT과 결과가 달라 "소개글 없음" 경고가 빠질 수 있음. |

## 수정 묶음 제안

| 묶음 | 지적 | 비고 |
|---|---|---|
| A. 조회 실패와 1000건 잘림 | P1-1~6, P1-9, P2-1~4 | **수정함 (2026-10-04, 브랜치 `Yngie-C/fix-read-api`).** `readAllRows()`(`lib/supabase/read-all.ts`)로 끝까지 읽고, 조회 실패는 500·없음만 404. 저자 이름 실패는 로그만. 화면: 매출 카드는 실패 시 "—", 상세는 404일 때만 "삭제됐거나 권한 없음"·그 밖은 "다시 시도". 테스트 `read-all.test.ts`, `analytics-routes.test.ts`, `workbooks-route.test.ts`, `detail-route.test.ts` (새 22개 중 13개가 예전 코드에서 실패) |
| B. 탐색 입력 | P1-7, P2-5~7 | **수정함 (2026-10-04, 같은 브랜치).** 검색어는 `ilikeAnyFilter()`(`lib/postgrest-filter.ts`)가 LIKE 와일드카드와 PostgREST 값을 두 겹으로 이스케이프해 큰따옴표로 감쌈. 숫자가 아닌 쪽수는 기본값, UUID 아닌 `author_id`는 400, 마지막 정렬 `id`·`newest`는 `nullsFirst: false`, DB 원문 대신 한국어 500. `*`는 PostgREST가 `%`로 바꿔 글자 그대로 찾을 수 없음(더 넓게 찾을 뿐). 테스트 `postgrest-filter.test.ts`, `explore-route.test.ts`(9개 중 8개가 예전 코드에서 실패). **실제 PostgREST로는 아직 확인 안 함** — 개발 서버에서 `C++, Python`, `100%`, `say "hi"` 검색 확인 필요 |
| C. 책 생성 입력 | P2-10~13 | **수정함 (2026-10-04, 같은 브랜치).** POST가 `readJsonObject()`·`readBookTitle()`·`BOOK_LANGUAGES`를 PUT과 같이 씀. 가격은 `isBookPrice()`(INTEGER 범위의 0 이상 정수) — 보내지 않으면 무료, 보냈는데 읽을 수 없으면 400(전에는 `"9900"`이 조용히 무료가 됨). 공백 소개글은 null, DB 원문 대신 한국어 500. 테스트 `books-route.test.ts`(13개 중 9개가 예전 코드에서 실패) |
| D. 상세 목차 | P1-8, P2-8, P2-9 | **수정함 (2026-10-04, 같은 브랜치) — P2-9는 보류.** 결정: 사지 않은 독자에게 장 제목은 공개. 마이그레이션 `00011`의 `book_table_of_contents()`가 공개 발행본이거나 접근이 있는 책의 published 장 제목·순서만 돌려줌(본문 없음, 정책은 그대로). 상세 라우트는 소유자가 아니면 이 함수를 씀. 독자로 보기(`viewAs=customer`)는 draft 장을 빼고, 장 번호는 `order_index + 1` 대신 목록 위치. `rls.test.ts`에 통과·차단 5개, `detail-route.test.ts` 7개. **`00011` 원격 적용 전** — 적용 전에 배포하면 상세 목차가 500. P2-9: 화면이 이미 0/0이 아니라 "문항 없음"으로 그림. 접근을 잃은 책을 따로 표시하려면 책마다 접근 판정이 필요해 M6 뒤로 |

### 묶음 A 계획

**1. 끝까지 읽는 헬퍼 하나** — `src/lib/supabase/read-all.ts`
- `readAllRows(buildPage)`: `buildPage(from, to)`가 돌려주는 쿼리를 1000건씩 읽고, 한 번이라도 `error`면 `{ error }`로 끝냄. 반쪽 결과를 돌려주지 않음.
- 페이지를 나누려면 순서가 고정돼야 하므로 호출하는 쪽이 유일한 키로 `.order()`를 걸어야 함(`id`, RPC는 `block_id, field_key` 등). 헬퍼 주석에 적음.
- 같은 반복문이 이미 세 벌(`responses`·`pdf` 라우트, `publish-checks-loader.ts`) 있음. `responses`와 `publish-checks-loader.ts`는 헬퍼로 바꿨고, `pdf` 라우트는 PR #12가 같은 파일을 크게 바꿔서 그 병합 뒤로 미룸.

**2. 조회 오류 처리 규칙** — 실패하면 `console.error`로 원문을 남기고 500(`SERVER_ERROR`, 한국어 문구). 없음과 실패를 구분:
- `.single()`의 PGRST116, `.maybeSingle()`의 `data: null`만 404.
- 저자 이름 조회는 예외: 로그만 남기고 `null`로 그림. `purchases` 라우트가 이미 그렇게 하고 테스트("저자 이름 조회가 실패해도 서재는 그린다")가 있어 그 선례를 따름. landing은 그 응답이 5분 캐시되는 것을 감수.

**3. 파일별 작업**

| 파일 | 고칠 것 |
|---|---|
| `analytics/sales/route.ts` | 두 조회 오류 → 500. 구매를 `readAllRows`로(`order("id")`). |
| `analytics/workbook/route.ts` | 소유 확인 오류 → 500(P2-2). 장·블록 오류 → 500. 블록(`order("id")`)과 RPC(`order("block_id").order("field_key")`)를 `readAllRows`로. |
| `my/workbooks/route.ts` | 응답·블록을 `readAllRows`로. 책·블록·프로필 오류 → 500. `last_written_at`은 `written_at ?? updated_at`(P2-4). |
| `books/[bookId]/detail/route.ts` | 책: PGRST116만 404, 나머지 500(P2-3). 장·프로필 오류 → 500(P1-9). |
| `explore/route.ts`, `landing/route.ts` | 프로필 조회 오류 → 500(P2-1). landing은 기존 `throw` 흐름에 합침. |

**4. 테스트** — 일곱 라우트에 테스트가 없으므로 `purchases-route.test.ts`의 목 패턴을 따라 새로:
- `read-all.test.ts`: 1000건 경계(정확히 1000건이면 한 번 더 읽음), 중간 페이지 오류 시 반쪽 결과 없이 오류.
- 라우트마다 조회 하나씩 실패시켜 500인지, 1000건 넘는 데이터가 다 세지는지, PGRST116은 404인지.
- `my/workbooks`: `written_at`이 있으면 그것으로 정렬.

**5. 확인** — `npm run typecheck && npm test && npm run lint`(에러 10개 이하), `npm run build`. 화면은 크리에이터 대시보드(매출·참여), `/my` 워크북 목록, 상세를 개발 서버에서 한 번씩.

**정한 것** (2026-10-04)
1. 기존 반복문은 헬퍼로 바꿈(`pdf` 라우트만 PR #12 병합 뒤).
2. 저자 이름 실패는 500이 아니라 로그만 — 처음 권장(500)을 `purchases` 선례에 맞춰 바꿈.

**화면도 함께 고침.** 라우트만 500으로 바꾸면 크리에이터 화면은 `salesData?.totalRevenue ?? 0`으로 여전히 0원을, 상세 화면은 500도 "삭제됐거나 권한 없음"을 띄웠음.
