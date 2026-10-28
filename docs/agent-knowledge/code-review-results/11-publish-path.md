# 11단계 리뷰 결과 — 출간 경로 개편

- 날짜: 2026-10-24
- 실행 (경로마다 따로, 워크트리 `orca/workspaces/inspic/code-review-11`):
  ```
  /code-review high src/lib/book-publish.ts
  /code-review high src/app/api/books/[bookId]/route.ts
  /code-review high src/lib/authoring-input.ts
  /code-review high src/app/create/edit/[bookId]/EditPageContent.tsx
  /code-review high src/components/preview/PublishChecklist.tsx
  ```
- 대상 커밋: `2c088ad` (10-A 병합 뒤. 다섯 경로 모두 브랜치 diff가 없어 파일 전체를 검토)
- 원 지적 44건(book-publish 8 · books route 9 · authoring-input 9 · EditPageContent 10 · PublishChecklist 8). 같은 원인이 두 경로에서 나온 3건을 합쳐 **41건 (P0 3 · P1 20 · P2 18)**.
  - 합친 것: "422인데 쓸 수 있는 사유가 없으면 미리보기에서 '미리보기에서 확인해 주세요'"(book-publish 3 · PublishChecklist 4 → P1-17), "소개글 길이 상한 없음"(route 5 · authoring-input 7 → P2-7), "검수 조회를 세 키로 따로 부름"(EditPageContent 10 · PublishChecklist 8 → P2-18).
  - books route 9(책 DELETE가 본문 이미지 정리를 기다림)는 [10-P1-18](10-storage-profile.md)과 같은 원인이라 이 문서에서는 P2-3으로 적고 수정은 10-C에 맡겨요.
- **검증 상태**
  - 직접 대조함: P0-1(node에서 공백 2만 자에 320ms — 리뷰는 4만 자 1.3초·8만 자 5.2초), P0-2(`EditPageContent.tsx:159` `setSaved(true)`가 조건 없음), P1-1(`books_update_own`이 00001에서 행 전체를 열고, 00015 트리거는 URL 컬럼 셋만 지킴), P1-2(`route.ts:252` UPDATE에 `status`·`visibility` 조건 없음), P1-4(`route.ts:72` `chaptersError.message`를 그대로 냄), P1-13(`["publish-checks"]`를 비우는 곳이 저장소에 없음 — 편집 화면은 `["publish-blockers"]`만 비움), P1-14(`PublishChecklist.tsx:62` 성공 뒤 비우지 않고 `router.push`), P1-18(`BookDetailClient.tsx:175` 확인 없이 `mutate()`), P1-20(`authoring-input.ts:90` 주석이 "DB CHECK는 없습니다", 00015는 `NOT VALID` CHECK를 걺).
  - 나머지는 리뷰 출력 그대로이고, 테스트·앱 확인은 하지 않았어요.

계획은 [code-review-plan.md](../code-review-plan.md), 이전 결과는 [10-storage-profile.md](10-storage-profile.md)를 보세요.

## 공통 원인 네 가지

1. **공개 판정을 앱만 지킨다.** 검수, `status` 허용값, `published_at` 찍기가 책 PUT 라우트 안에만 있고 `books_update_own`은 소유자에게 행 전체를 열어 둬요(P1-1). 10단계에서 URL 컬럼을 막은 것과 같은 구멍이에요. 라우트 안에서도 맨 앞에 읽은 상태로 판정하고 UPDATE가 그 상태를 다시 확인하지 않아, 요청이 겹치면 검수 없이 공개돼요(P1-2).
2. **편집 화면의 저장이 직렬화되지 않는다.** 저장 요청이 겹칠 수 있고, 끝난 요청이 지금 화면 상태를 확인하지 않고 `saved`·`saveError`를 덮어요. 그래서 진행 중에 쓴 글이 "저장됨"이 되어 버려지고(P0-2), 늦게 끝난 옛 저장이 새 본문을 덮고(P0-3), 지운 장·바꾼 장의 결과가 지금 장에 붙어요(P1-6·P1-9). 독자 응답 쪽은 이미 "저장 요청은 한 번에 하나"로 고쳤는데(WP5) 저작 쪽은 아직이에요.
3. **같은 검수 결과를 세 벌로 읽는다.** 미리보기 패널(`["publish-checks"]`), 편집 배너(`["publish-blockers"]`), 공개 뒤 경고 수(`fetchWarningCount`)가 같은 엔드포인트를 따로 불러요(P2-18). 한쪽만 비워져 미리보기가 옛 판정을 보여 주고(P1-13), 422가 실어 준 사유를 버리고 다시 불러오다 실패하면 사유 없이 막혀요(P1-15·P1-16·P1-17).
4. **입력 검증이 길이·문자 범위를 끝까지 보지 않는다.** 정규식을 길이 검사보다 먼저 돌려 ReDoS가 생기고(P0-1), 제목·소개글에는 상한이 없고(P2-6·P2-7), DB가 거절할 값(U+0000, INT 끝값)을 통과시켜 400 대신 500이 나요(P2-4·P2-5). 같은 검사를 라우트마다 손으로 다시 써서 한쪽이 빠져요(P2-7·P2-9).

## P0

| # | 위치 | 지적 |
|---|---|---|
| P0-1 | `authoring-input.ts:139` | bio 줄바꿈 정규식 `/\s*[\r\n]+\s*/g`가 줄바꿈 없는 공백열에서 O(N²)이고, 80자 검사보다 먼저 돎. 로그인한 사용자가 `PUT /api/my/profile`에 1MB짜리 공백 bio 하나를 보내면 이벤트 루프가 몇 분 멈춤(ReDoS). |
| P0-2 | `EditPageContent.tsx:159` | `saveChapter`가 끝나면 조건 없이 `setSaved(true)` → 저장이 도는 동안 쓴 글도 "저장됨"이 됨. 3초 안에 다른 장·[미리보기]·[공개하기]를 누르면 `!saved`가 false라 저장을 건너뛰고 그 글이 사라짐. 검수도 옛 본문으로 함. |
| P0-3 | `EditPageContent.tsx:193` | 장 저장이 직렬화되지 않음(진행 중 표시·순번 없음) → 느린 저장 A(v1) 뒤에 저장 B(v2)가 먼저 커밋되면 A가 나중에 v1로 덮음. [다시 시도]를 디바운스 중에 눌러도 겹침. 저자는 "저장됨"을 봤으므로 알 길이 없음. |

## P1

| # | 위치 | 지적 |
|---|---|---|
| P1-1 | `api/books/[bookId]/route.ts:209` | 검수·`status` 허용값(`processing`·`unlisted` 거절)·`published_at` 찍기가 라우트에만 있음. `books_update_own`이 행 전체를 열어 PostgREST `PATCH /rest/v1/books {status:'published', visibility:'public'}`이면 검수 없이 공개되고, `unlisted`·`processing`·임의의 `published_at`도 들어감. |
| P1-2 | `api/books/[bookId]/route.ts:222` | `wasPublic`/`becomesPublic`을 요청 맨 앞의 `existing`으로 판정하고 UPDATE는 그 상태를 다시 보지 않음 → 탭 A의 내리기와 옛 화면 탭 B의 공개가 겹치면 B는 `wasPublic=true`로 검수를 건너뛰고 A 뒤에 커밋돼, 차단 사유가 있는 책이 다시 공개됨. |
| P1-3 | `api/books/[bookId]/route.ts:54` | GET(54)·PUT(90)·DELETE(282)가 `.single()`의 모든 에러를 로그 없이 404 "Book not found"로 냄. DB가 잠깐 실패하면 산 독자의 리더와 편집 화면이 "책 없음"을 보여 줌. AGENTS.md "404는 행이 없을 때만" 위반. |
| P1-4 | `api/books/[bookId]/route.ts:72` | 장 조회 실패 때 Postgres 원문 `chaptersError.message`를 그대로 응답하고 서버 로그는 없음 → 비로그인 독자에게 함수·테이블 이름이 든 영문 오류가 보이고 운영에선 원인을 못 찾음. |
| P1-5 | `api/books/[bookId]/route.ts:230` | 검수가 같은 요청이 바꾸는 `title`을 반영하지 않음(저장 전 DB 행을 읽음) → 빈 제목 책에 `{title:'새 제목', status:'published'}`를 보내도 "빈 책 제목"으로 422. |
| P1-6 | `EditPageContent.tsx:246` | 선택한 장을 지울 때 `debounceRef`를 지우지 않고 `saved`도 되돌리지 않음 → 3초 뒤 지운 장에 PUT이 가서 404, 없는 장에 "저장 안 됨" 배너. [다시 시도]는 지금 장을 저장함. |
| P1-7 | `EditPageContent.tsx:116` | 삭제로 `selectedId`가 null이 되면 처음 고르기 이펙트가 아직 지운 장이 든 캐시에서 `chapters[0]`을 다시 고름 → 다시 불러온 뒤 `selectedChapter`가 없어 빈 화면에 "저장됨"이 남고, 이펙트는 다시 돌지 않음. |
| P1-8 | `EditPageContent.tsx:271` | `setChapterStatus`가 `flushPendingSave` 없이 `PUT {status}`를 보냄 → 블록을 고친 직후 "이 장 공개하기"를 누르면 검수가 저장 전 본문을 봄. 고친 차단으로 막히거나, 확인 안 된 본문이 뒤이은 자동 저장으로 공개됨. `openPreview`·`handlePublish`는 먼저 비움. |
| P1-9 | `EditPageContent.tsx:147` | 장을 바꾼 뒤 끝난 이전 장의 저장이 새 장의 `saveError`·`saved`를 정함 → X의 실패가 Y를 연 채로 뜨고 [다시 시도]는 Y를 저장함. X가 성공하면 Y의 미저장 입력을 `saved=true`로 덮어 P0-2로 이어짐. |
| P1-10 | `EditPageContent.tsx:81` | 조회 실패를 빈 결과로 그림: 장 `[]`, 차단 `[]`, `isError`를 안 봄 → 장 목록 500이면 "아직 장이 없어요"(저자가 장을 중복으로 더함), 검수 실패면 차단 배너가 조용히 사라짐, 책 조회 실패면 제목 없이 [공개하기]가 뜸. AGENTS.md "조회 실패를 빈 결과로 넘기지 마세요" 위반. |
| P1-11 | `EditPageContent.tsx:410` | `beforeunload`가 없고 '스튜디오' 뒤로 버튼도 저장을 비우지 않음 → 디바운스(제목 1.5초, 본문 3초) 안에 탭을 닫거나 저장 실패를 보는 중에 나가면 경고 없이 사라짐. 127행 주석이 바로 이 경우를 막는다고 적음. |
| P1-12 | `EditPageContent.tsx:262` | 장 비공개 확인창과 상태 문구가 `everPublished`/`bookPublic`이 아니라 지금의 `bookPublished`를 봄 → 내린 판매 책에서 '비공개로 돌리기'가 확인 없이 구매자에게서 장을 숨기고, published+private 책은 "독자에게 공개 중"이라고 표시. |
| P1-13 | `PublishChecklist.tsx:49` | `["publish-checks", bookId]`를 비우는 곳이 없고 앱 기본 staleTime이 5분 → 편집 화면에서 차단을 고치고 5분 안에 [미리보기]로 돌아오면 고친 차단이 그대로 남아 [공개하기]가 꺼져 있음. 반대로 새 차단이 생겨도 "바로 공개할 수 있어요". |
| P1-14 | `PublishChecklist.tsx:62` | 공개 성공 뒤 `["book-detail"]`·`["book"]`을 비우지 않고 `router.push` → 책 상세가 캐시로 [공개하기]를, 편집 화면이 [공개 중 ▾] 대신 [공개하기]를 보여 주고 `published_at`이 null로 캐시돼 차단 배너 조회가 꺼짐. 편집 화면 공개 경로는 비움. |
| P1-15 | `PublishChecklist.tsx:65` | 422가 실어 준 `result.blockers`를 버리고 `refetch()`에 기댐 → 다시 불러오기가 실패하면(던지지 않음) "위 항목을 확인해 주세요"가 옛 통과 목록 옆에 뜨고 버튼은 켜짐. 편집 화면은 `setQueryData`로 넣음. |
| P1-16 | `PublishChecklist.tsx:138` | 버튼이 `data?.can_publish`와 `isFetching`만 봄 → 배경 재조회가 실패하면 "불러오지 못했어요"와 옛 "바로 공개할 수 있어요"가 함께 보이고 [공개하기]가 켜진 채. |
| P1-17 | `book-publish.ts:40`, `PublishChecklist.tsx:71` | 422인데 쓸 수 있는 사유가 없으면 `kind: "error"`로 "미리보기에서 확인해 주세요" → 미리보기 패널 안에서 그 문구가 뜨고, error 분기는 다시 불러오지도 않아 옛 통과 목록과 켜진 버튼이 남음. |
| P1-18 | `book-publish.ts:71` | 내리기 확인 문구가 모듈에 없어 화면마다 다름 → 책 상세(`BookDetailClient.tsx:175`)는 [비공개로 전환]을 확인 없이 바로 실행. 편집 화면은 자체 문구로 물음. |
| P1-19 | `book-publish.ts:50` | 422가 아닌 실패(401·403·404 포함)를 모두 "잠시 뒤 다시 시도해 주세요"로 냄 → 세션이 만료된 저자가 다시 로그인하라는 안내 없이 계속 재시도함. |
| P1-20 | `authoring-input.ts:90` | 주석이 "DB CHECK는 없습니다"인데 00015가 `bio` 80자 `NOT VALID` CHECK를 걺. NOT VALID여도 UPDATE는 행 전체를 검사하므로, 예전에 80자 넘게 쓴 사용자가 `display_name`만 바꿔도 23514 → 일반 500 `SAVE_FAILED`. 고칠 방법이 화면에 드러나지 않음. |

## P2

| # | 위치 | 지적 |
|---|---|---|
| P2-1 | `api/books/[bookId]/route.ts:58` | GET이 published 장 전부를 `select('*')`(본문 포함)로 읽는데 편집 화면 `fetchBook`은 `chapters`를 버리고 `/api/chapters`로 따로 읽음 → 편집 화면을 열 때마다 공개 장 본문 전체를 읽고 버림. |
| P2-2 | `api/books/[bookId]/route.ts:43` | GET이 매번 `getAuthUser()`(Auth 서버 왕복)를 먼저 기다림. 쓰는 곳은 `?drafts=1`뿐 → 익명 독자 리더 로딩에도 직렬 왕복 하나. |
| P2-3 | `api/books/[bookId]/route.ts:306` | DELETE가 `removeBookFiles`를 응답 전에 기다림 → 이미지 많은 책 삭제가 오래 걸림. **10-P1-18과 같은 원인, 10-C에서 `after()`로 함께 고침.** |
| P2-4 | `authoring-input.ts:53` | `isOrderIndex`가 INT 끝값 2147483647을 받음 → 그 뒤 `POST /api/chapters`의 `+1`이 22003으로 매번 500, 장을 더 못 더함. |
| P2-5 | `authoring-input.ts:30` | 제목·`bio`·`about`에 U+0000이 통과 → Postgres TEXT가 22P05로 거절해 400 대신 500, 같은 요청의 다른 필드도 저장 안 됨. |
| P2-6 | `authoring-input.ts:37` | 책·장 제목 길이 상한이 앱·DB 어디에도 없음 → 1MB 제목이 목록·PDF 표지·EPUB nav·내려받기 파일 이름까지 퍼짐. |
| P2-7 | `api/books/[bookId]/route.ts:111`, `authoring-input.ts:104` | 소개글(`description`)에 길이 상한이 없음(`audience` 1000자, `detail_image_alt` 2000자는 있음). 원인은 `readOptionalText`를 export하지 않아 책 라우트 두 곳이 같은 검사를 손으로 서너 번씩 다시 쓰다 빠뜨린 것. |
| P2-8 | `authoring-input.ts:112` | 길이를 `.length`(UTF-16)로 세고 DB CHECK는 `char_length`(코드포인트) → 이모지가 섞인 50자 bio가 81로 세어져 거절됨. |
| P2-9 | `authoring-input.ts:24` | 복붙 중복: `readChapterTitle`/`readBookTitle`, `isOrderIndex`/`isBookPrice` 본문이 같고, `isChapterStatus`가 `isOneOf`를 다시 구현. P2-5·P2-6을 고칠 때 한쪽만 고쳐질 원인. |
| P2-10 | `authoring-input.ts:76` | `BOOK_VISIBILITIES`에 `unlisted`가 남아 `isOneOf`가 받음. "새로 고를 수 없음" 규칙은 책 PUT 라우트에만 있어 새 호출자가 그대로 받아들일 수 있음. |
| P2-11 | `book-publish.ts:37` | 형식이 깨진 blocker를 조용히 버리고 `level`·`chapterIds`는 검사하지 않음 → 사유 일부만 보이고, `chapterIds`가 배열이 아닌 항목도 `PublishCheck`로 통과. |
| P2-12 | `book-publish.ts:77` | `unpublishBook`의 에러 문구는 어디서도 안 보이고, 네트워크 오류는 날 TypeError → 두 호출자가 실패 문구를 따로 하드코딩. `publishBook`처럼 결과 타입으로. |
| P2-13 | `book-publish.ts:56` | `bookId`를 `encodeURIComponent` 없이 경로에 넣음(72행도). |
| P2-14 | `book-publish.ts:59` | 주석이 "서버는 draft → published일 때만 public을 채운다"인데 실제 조건은 `existing.status !== 'published'`(archived 포함). visibility를 보내는 진짜 이유(published+private)가 흐려짐. |
| P2-15 | `book-publish.ts:72` | `publishBook`/`unpublishBook`이 같은 fetch 설정을 반복. 비공개 `putBookState()` 하나로. |
| P2-16 | `PublishChecklist.tsx:29` | `fetchChecks`가 응답 형태를 검사하지 않음 → 2xx인데 본문이 다르면 `data.blockers.length`에서 미리보기 화면 전체가 TypeError. |
| P2-17 | `PublishChecklist.tsx:112` | 이미 공개한 책에도 "바로 공개할 수 있어요"(하단은 "이미 공개한 책이에요"). 경고만 있을 때 공개를 막지 않는다는 안내가 없음. |
| P2-18 | `PublishChecklist.tsx:26`, `EditPageContent.tsx:344` | 같은 `/publish-checks`를 `["publish-checks"]`·`["publish-blockers"]`·`fetchWarningCount` 세 벌로 부름 → 공개 한 번에 같은 검수 두 번, 설정에서 제목을 고쳐도 차단 배너가 남음(`handleMetaSave`가 비우지 않음). P1-13의 근본 원인. |

## 수정 묶음

묶음 이름은 다른 단계와 구분하려고 `11-`을 붙여요. 한 묶음 = 한 PR. 순서는 **11-A → 11-B → 11-C → 11-D**이고, 다른 단계 묶음과의 순서는 [code-review-plan.md](../code-review-plan.md) 2차 절의 "수정 순서"를 따라요.

- 11-A는 ReDoS(P0-1)라 다른 단계 묶음보다도 먼저 해요. 파일이 작고 겹치는 묶음이 없어요.
- 11-B와 11-D는 둘 다 `EditPageContent.tsx`를 만지므로 11-B를 먼저 병합하고 11-D를 그 위에서 시작해요.
- 11-D의 실패 안내(P1-19)는 11-C가 새로 내는 409를 다뤄야 하므로 11-C 뒤에 해요.

| 묶음 | 지적 | 비고 |
|---|---|---|
| 11-A. 입력 검증 | P0-1, P1-20, P2-4~10 | `authoring-input.ts`와 책 라우트 두 곳. ReDoS가 이번 단계에서 가장 급함. 마이그레이션은 결정 2에 따라 생길 수 있음. |
| 11-B. 편집 화면 저장 한 줄로 | P0-2, P0-3, P1-6~9, P1-11 | `EditPageContent.tsx`의 저장 경로. 독자 응답 쪽 WP5와 같은 규칙(한 번에 하나, 끝난 저장은 자기 것만 반영). |
| 11-C. 공개 전환을 DB가 지키게 | P1-1~5, P2-1, P2-2 | 새 마이그레이션(다음 번호). 10-A와 같은 트리거 + admin 쓰기 방식. 같은 파일의 조회 에러·GET 정리도 함께. P2-3은 10-C로. |
| 11-D. 공개 흐름 화면 한 벌 | P1-10, P1-12~19, P2-11~18 | `book-publish.ts`·`PublishChecklist.tsx`·`EditPageContent.tsx`(조회·공개 부분)·`BookDetailClient.tsx`. 검수 조회를 한 키로 합치는 것이 중심. |

### 묶음 11-A 계획 — 입력 검증

> 2026-10-25 수정함(브랜치 `Yngie-C/code-review-11a`, 마이그레이션 없음). P0-1은 `joinLines()`(줄로 나눠 다듬고 공백으로 잇기, 선형)로 바꿨고, 공백 20만 자 bio가 1초 안에 끝나는 테스트를 넣었어요 — 예전 정규식은 같은 입력에 수십 초예요(2만 자 320ms에서 셈). P1-20은 주석을 00015에 맞추고 프로필 PUT이 23514 `user_profiles_bio_length`를 400 "한 줄 소개가 80자를 넘어요"로 안내해요. 결정 3은 권장안대로 **앱에서만** 책·장 제목 200자, 소개글 2000자(책 PUT·POST·업로드, 설정 폼·장 제목 입력에 `maxLength`) — DB CHECK와 결정 2의 `VALIDATE`는 운영 DB의 최대 길이·긴 bio 수를 본 뒤 11-C 마이그레이션에 함께 넣어요. 장 순서 상한은 1,000,000. U+0000 거절, 코드포인트로 세기(`textLength()`), 제목 검사 한 벌(`readRequiredTitle`), 정수 검사 한 벌, `readOptionalText` export와 책 라우트 세 필드, `readVisibility()`로 `unlisted` 규칙을 옮김(책 PUT의 따로 있던 검사는 지움). 화면의 글자 수 표시와 `maxLength`는 브라우저 규칙상 UTF-16으로 세서 서버보다 엄격한 쪽이라 그대로 뒀어요.

**1. ReDoS (P0-1)** — 길이를 먼저 보고 치환은 선형 패턴으로. `bio`가 문자열이면 `MAX_BIO_LENGTH`보다 크게 잡은 원문 상한(예: 1000자)을 먼저 넘기면 바로 400, 그 뒤 `/[\r\n]+/g` → 공백, 연속 공백 접기. 테스트: 공백 10만 자 bio가 400을 바로(수 ms 안에) 돌려주는지, 줄바꿈이 섞인 bio가 예전과 같은 결과인지.

**2. bio CHECK와 맞추기 (P1-20)** — 처리는 결정 2. 어느 쪽이든 주석을 00015에 맞게 고치고, 프로필 PUT이 23514를 받으면 500이 아니라 "한 줄 소개가 80자를 넘어요. 줄여 주세요"(400)로 안내.

**3. 문자·범위 (P2-4·P2-5·P2-8)** — `isOrderIndex`는 상한을 INT 끝값보다 낮게(예: 1,000,000). 텍스트 읽기 공용 함수에서 U+0000 거절. 길이는 코드포인트로 세기(`[...s].length`) — 화면의 글자 수 표시도 같은 셈인지 확인.

**4. 상한과 중복 (P2-6·P2-7·P2-9·P2-10)** — `readOptionalText` export, 책 라우트 두 곳의 손 검사를 그것으로. 제목·소개글 상한은 결정 3. 제목 함수 하나(`readRequiredTitle(value, message)`), 정수 함수 하나, `isChapterStatus`는 `isOneOf`로. `visibility`는 `readVisibility(value, current)`로 "이미 `unlisted`면 유지, 새로 고르면 거절"을 여기 한 곳에.

**5. 확인** — `authoring-input` 단위 테스트, `book-route.test.ts`·`books-route` 테스트에 소개글 상한·NUL. `npm run typecheck && npm test && npm run lint`(에러 9개 이하), `npm run build`.

### 묶음 11-B 계획 — 편집 화면 저장 한 줄로

> 2026-10-26 수정함(브랜치 `Yngie-C/code-review-11b`, 서버·마이그레이션 변경 없음). 장 저장 줄을 `lib/chapter-save-queue.ts`(`ChapterSaveQueue`, React 없음)로 떼고 `useChapterSaver()`(편집 화면 폴더)가 화면에 붙여요. 장마다 상태를 따로 들고(입력 순번·확인된 순번·실패·진행 중 저장), 저장은 장마다 한 번에 하나 — 도는 동안의 입력은 마지막 값만 바꾸고 끝난 뒤 순번이 달라졌으면 그 값을 한 번 더 보내요(P0-2·P0-3). `saved`·`saveError`는 state가 아니라 지금 연 장의 상태에서 오고, 다른 장의 실패는 사이드바 그 장 옆에 `저장 안 됨`(danger 600)으로 남아요(P1-9). 실패한 저장은 저절로 다시 보내지 않고, 같은 값을 기다리던 flush(장 바꾸기 등)도 false예요 — 새 입력은 그 입력의 타이머가, 같은 값은 [다시 시도]가 보내요. 삭제는 `hold`(타이머 지우고 도는 저장을 기다림) → DELETE → 성공이면 `discard`하고 캐시에서 그 장을 뺀 뒤 그 자리의 다음 장을 열고, 실패면 `release`로 남은 입력을 보내요(P1-6·P1-7). 장 공개 전환은 `flushPendingSave`(이제 모든 장의 `flushAll`) 뒤에만 보내요(P1-8). 저장 안 된 입력·실패가 있으면 `beforeunload`로 막고, '스튜디오'는 저장을 끝낸 뒤 이동하고 실패하면 머물러요. 화면을 앱 안에서 떠나면(언마운트) 대기 중인 저장을 바로 보내요(P1-11). 계획에 없던 것 둘: 저장이 성공하면 장 목록 캐시의 그 장을 서버가 돌려준 행으로 바꿔 둬요(다시 불러오기 전에 그 장을 다시 열어 옛 본문으로 편집을 시작하지 않게). 지금 연 장을 다시 누르면 아무것도 하지 않아요(예전에는 캐시 값으로 다시 열어 저장 중인 입력이 편집 값에서 사라지고 `saved=true`가 됐어요).
>
> 테스트: `EditPageContent.test.tsx` 10개(가짜 fetch가 PUT을 붙잡고 순서를 정함 — 저장 중 입력 뒤 장 바꾸기, 겹침·순서 뒤바뀜, 저장 중 [다시 시도], 장 전환 중 실패, 입력 직후 삭제, 장 공개 전환 전 저장·실패, `beforeunload`, '스튜디오'). **수정 전 코드에서 9개가 실패**함을 먼저 확인했어요(나머지 하나는 "저장이 끝나면 막지 않는다" 대조군). `chapter-save-queue.test.ts` 8개(느린 저장, flush가 타이머와 진행 중 저장을 둘 다 기다림, 실패 뒤 자동 재전송 없음, 순서를 뒤집어 끝난 두 장, 지운 장의 타이머·결과 무시, hold/release, 던지는 저장). hold 테스트가 "붙잡은 장에도 도는 저장 뒤 남은 입력을 보내는" 버그를 잡아 고쳤어요.
>
> 확인 안 함: 실제 Supabase로 띄운 개발 서버에서의 6번 시나리오(네트워크를 느리게 걸고 입력 → 장 전환 → 다시 열기)와 Tiptap 에디터의 실제 `onUpdate` 타이밍 — 테스트는 에디터를 textarea로 갈음했어요. 브라우저 탭 닫기 경고는 브라우저가 문구를 정해요.

**1. 저장을 한 번에 하나로 (P0-2·P0-3)** — 장 저장을 큐 하나로: 진행 중이면 새 요청을 보내지 않고 "마지막 값"만 바꿔 두었다가, 끝나면 그 값이 보낸 값과 다를 때 한 번 더 보냄. 저장할 때 편집 순번을 함께 들고 가서, 끝났을 때 순번이 그대로일 때만 `saved=true`. `flushPendingSave`는 대기 타이머와 진행 중 저장을 둘 다 기다림.

**2. 결과는 자기 장에만 (P1-9)** — 저장 결과를 `chapterId`로 받아, 지금 선택한 장과 같을 때만 `saved`·`saveError`를 바꿈. 다른 장의 실패는 사이드바의 그 장 옆에 "저장 안 됨"으로 남기고, 장을 바꿀 때는 이미 1에서 먼저 비우므로 드물어야 함.

**3. 장 삭제 (P1-6·P1-7)** — 지우기 전에 그 장의 대기 타이머·큐를 버리고 `saved`·`saveError`를 되돌림. 삭제 성공 뒤 캐시에서 그 장을 먼저 빼고(`setQueryData`) 다음 장을 고름.

**4. 장 공개 전환 (P1-8)** — `setChapterStatus` 앞에 `flushPendingSave`. 저장이 실패하면 전환하지 않고 "저장 안 됨"을 그대로 둠(장 바꾸기와 같은 규칙).

**5. 나갈 때 (P1-11)** — 저장 안 된 입력이 있거나 실패 상태면 `beforeunload`로 막음. '스튜디오' 버튼은 `flushPendingSave` 뒤 이동, 실패하면 머묾.

**6. 확인** — 컴포넌트 테스트(가짜 fetch로 느린 응답·순서 뒤바뀜·장 전환 중 실패·삭제 직후 타이머). 개발 서버에서 네트워크를 느리게 걸고 입력 → 장 전환 → 다시 열어 본문이 남는지.

### 묶음 11-C 계획 — 공개 전환을 DB가 지키게

**1. 상태 컬럼 잠그기 (P1-1)** — 방식은 결정 1. 권장안: BEFORE UPDATE/INSERT 트리거로 `authenticated`·`anon`이 `books.status`·`visibility`·`published_at`을 바꾸면 42501(00015와 같은 모양, 같은 함수에 컬럼을 더하거나 새 트리거). 책 PUT은 소유자 확인과 검수를 마친 뒤 그 세 컬럼만 `createAdminClient()`로 씀. 내리기도 같은 경로. 다른 필드(제목·소개 등)는 지금처럼 사용자 권한.
  - 새 책 INSERT(`POST /api/books`)가 정하는 초기값(`draft`/`private`)은 트리거가 허용하는 기본값과 같아야 함 — 값을 들고 오는 INSERT만 거절.
  - 장(`chapters.status`)도 같은 구멍인지 확인하고, 같으면 같은 마이그레이션에 넣음(장 공개 전환 검수, WP7).

**2. 겹친 요청 (P1-2)** — admin UPDATE에 `.eq("status", existing.status).eq("visibility", existing.visibility)`와 소유자 키를 함께 걸고, 0행이면 409 `STATE_CHANGED` "다른 곳에서 상태가 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요".

**3. 같은 요청의 제목 (P1-5)** — 검수 결과에서 빈 제목 차단은 요청이 실어 온 `title`이 있으면 그 값으로 다시 판정(검수 로더를 바꾸지 않고 라우트에서 그 한 항목만 덮음). 판정 로직이 두 벌이 되지 않게 `publish-checks.ts`의 제목 판정 함수를 그대로 부름.

**4. 조회 에러 (P1-3·P1-4)** — GET·PUT·DELETE를 `maybeSingle()`로, error는 로그 + 500, null만 404. 장 조회 실패는 로그 + 일반 문구.

**5. GET 정리 (P2-1·P2-2)** — 편집 화면이 `chapters`를 받지 않게 `?fields=book`(또는 편집 화면이 쓰는 별도 조회), 사용자 확인은 `drafts=1`일 때만.

**6. 확인** — DB 테스트: `asUser`로 세 컬럼 UPDATE 차단, 같은 행 `title` UPDATE 통과, 소유자 연결 통과. `book-route.test.ts`: 상태가 바뀐 뒤의 공개 409, 제목과 함께 공개, 조회 에러 500. 운영 적용 순서는 10-A와 같이 **라우트 배포 → 마이그레이션**.

> 2026-10-27 수정함(브랜치 `Yngie-C/code-review-11c`, 마이그레이션 `00017_publish_state_guards.sql`). 결정 1·4는 권장안(트리거 + admin 쓰기, 겹치면 409). 결정 2·3은 운영 DB를 본 결과(책 제목 최대 17자, 장 제목 17자, 소개글 87자, 80자 넘는 bio 0건)로 `NOT VALID` 없이 처음부터 VALID로 걸었어요 — 책·장 제목 200자, 소개글 2000자, `user_profiles_bio_length`는 `VALIDATE CONSTRAINT`. P1-1은 `guard_book_publish_state()`(새 책은 `draft`·`private`·출간일 없음만, 그 뒤 세 컬럼은 바꾸지 못함)와 `guard_chapter_publish_state()`(출간한 적 있는 책의 장만, 라우트 검수와 같은 범위 — 출간 전 책의 장은 그대로 오가고 draft 장 추가는 막지 않음). 책 PUT은 상태가 실제로 바뀔 때만 같은 요청의 다른 필드까지 admin으로 한 번에 쓰고(제목과 공개가 한쪽만 저장되지 않게 — 계획의 "세 컬럼만 admin"에서 바꾼 점), 장 PUT은 검수를 거친 전환만 admin으로 써요. P1-2는 읽은 `status`·`visibility`(장은 `status`)를 UPDATE 조건으로 걸고 0행이면 다시 읽어 404/409 `STATE_CHANGED`. P1-5는 계획과 달리 라우트에서 항목을 덮지 않고 로더에 `assumeBookTitle`을 더했어요(`assumeChapterStatus`와 같은 방식이라 판정은 `runPublishChecks` 한 곳). P1-3·P1-4는 GET·PUT·DELETE를 `maybeSingle()`로, 에러는 로그 + 500, 장 조회 실패도 원문 없이 500. P2-1은 `?fields=book`(편집 화면 `fetchBook`), P2-2는 `?drafts=1`일 때만 `getAuthUser()`. DB 테스트 8개 중 차단 5개는 00017 없이 실패함을 확인(나머지 3개는 허용 케이스). 운영 적용은 **라우트 배포 → 00017**이고, 그 전에 `SUPABASE_SECRET_KEY`가 배포 환경에 있어야 해요(이미 업로드 라우트가 씀).

### 묶음 11-D 계획 — 공개 흐름 화면 한 벌

**1. 검수 조회 한 벌 (P2-18·P1-13)** — `lib/publish-checks-query.ts`에 `publishChecksQuery(bookId)`(키 `["publish-checks", bookId]`, 응답 형태 검사 포함 — P2-16) 하나. 편집 배너는 `select`로 blockers만, 공개 뒤 경고 수는 `qc.fetchQuery`로 같은 캐시. 장 저장·메타 저장·장 공개 전환·공개 뒤에 그 키 하나만 비움. 미리보기 패널은 마운트할 때 늘 새로 불러옴(`refetchOnMount: "always"`).

**2. 422와 실패 (P1-15·P1-16·P1-17·P1-19·P2-11·P2-12)** — `book-publish.ts`가 422면 깨진 항목이 섞여도 `kind: "blocked"`로 돌려주고 "보이지 않는 사유가 n개 더 있어요"를 함께 실음. 사유가 하나도 없을 때의 문구는 "미리보기에서"를 빼고 "새로고침한 뒤 다시 확인해 주세요". 401·403·404·409(11-C)는 각자 문구. `unpublishBook`도 같은 결과 타입. 미리보기 패널은 422 사유를 `setQueryData`로 넣고, 조회가 실패한 상태(`isError`)면 [공개하기]를 끔.

**3. 확인 문구 한 곳 (P1-18·P1-12)** — `UNPUBLISH_CONFIRM_MESSAGE`를 `book-publish.ts`에 두고 책 상세·편집 화면이 함께 씀. 장 비공개 확인과 상태 문구는 `everPublished`(구매자가 있을 수 있음)·`bookPublic`(새 독자에게 보임)으로 나눠 판정.

**4. 공개 뒤 캐시 (P1-14)** — 공개·내리기 성공 뒤 `["book"]`·`["book-detail"]`·검수 키를 비우는 것을 `book-publish.ts`의 훅(또는 공용 `afterPublishStateChange(qc, bookId)`) 하나로. 세 화면이 함께 씀.

**5. 조회 실패 화면 (P1-10)** — 편집 화면의 책·장·검수 조회가 실패하면 빈 결과 대신 "불러오지 못했어요 · 다시 시도". 장 목록이 실패한 동안 [장 추가]와 [공개하기]를 끔.

**6. 나머지 (P2-13·P2-14·P2-15·P2-17)** — `putBookState()`로 fetch 한 벌 + `encodeURIComponent`, 주석 고치기, 이미 공개한 책·경고만 있는 책의 빈 상태 문구.

**7. 확인** — `book-publish.test.ts`(422 깨진 항목·빈 사유·401·409), 패널 테스트(422 사유 표시·조회 실패 시 버튼 꺼짐). 개발 서버에서 편집 → 미리보기 → 차단 고치기 → 다시 미리보기, 공개 → 책 상세·편집 화면 버튼이 바로 바뀌는지.

## 결정이 필요한 것

1. **공개 상태 컬럼 잠그는 방식 (11-C).** 10-A와 같은 트리거 + admin 쓰기를 권장해요. 검수 로직이 TS(`loadPublishChecks()`)에 있어 SQL만으로 판정할 수 없으니, DB는 "사용자 권한으로는 못 바꾼다"만 지키고 판정은 라우트가 해요. 비교한 것:
   - SECURITY DEFINER RPC `set_book_state(book_id, status, visibility)`: 겹친 요청(P1-2)을 RPC 안에서 행 잠금으로 막기 쉽지만, 검수는 여전히 RPC 밖이라 "검수 → RPC" 사이 간격은 남고 RPC·권한이 하나 더 늘어요. 조건부 UPDATE로 같은 효과를 냄.
   - 컬럼 권한 회수: 10-A에서 뺀 이유와 같아요(컬럼을 더할 때마다 GRANT 목록).
2. **예전에 쓴 80자 넘는 bio (P1-20).** 먼저 운영 DB에서 `SELECT count(*) FROM user_profiles WHERE char_length(bio) > 80`을 봐요. 0이면 새 마이그레이션에서 `VALIDATE CONSTRAINT`로 굳히고 끝. 있으면 그 행을 80자로 자르지 않고 둔 채, 프로필 PUT이 23514를 400 "한 줄 소개를 80자 이내로 줄여 주세요"로 바꾸고 프로필 화면이 긴 bio를 열 때 같은 안내를 띄우는 방안을 권장해요(저자가 쓴 글을 DB가 말없이 자르지 않게).
3. **제목·소개글 상한 (P2-6·P2-7).** 책 제목 200자, 장 제목 200자, 소개글 2000자(`detail_image_alt`와 같은 값)를 권장해요. 먼저 운영 DB의 최대 길이를 보고 그보다 넉넉한지 확인해요. DB CHECK는 `bio`처럼 `NOT VALID`로 함께 거는 것을 권장해요 — 앱만 지키면 P1-1과 같은 구멍이 남아요.
4. **겹친 공개 요청의 응답 (P1-2).** 409로 알리고 새로고침을 안내하는 방안을 권장해요. 서버가 다시 읽어 판정을 이어 가면 사용자가 본 화면과 다른 결과(예: 이미 내린 책을 다시 공개)가 나요.
