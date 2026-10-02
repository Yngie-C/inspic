# 4단계 리뷰 결과 — 저작 측 블록 동기화와 출간

- 날짜: 2026-10-02
- 실행 (경로마다 따로):
  ```
  /code-review high src/components/editor/extensions/templates
  /code-review high src/lib/template-node-id.ts
  /code-review high src/app/api/chapters
  /code-review high src/app/api/books/[bookId]/route.ts
  /code-review high src/lib/publish-checks.ts
  /code-review high src/lib/publish-checks-loader.ts
  ```
- 대상 커밋: `d13dcb2` (여섯 경로 모두 `main`과 diff가 없어 파일 전체를 검토)
- 원 지적 56건(templates 10 · template-node-id 7 · chapters 10 · books 10 · publish-checks 10 · loader 9). 같은 원인을 여러 경로에서 짚은 것을 합쳐 **43건 (P0 5 · P1 26 · P2 12)**.
- **검증 상태**
  - templates 리뷰어가 scratchpad에 Tiptap 3 + prosemirror-model 1.25.12를 새로 설치하고 `createTemplateNode`·`assignNodeIds` 사본으로 **P0-1, P0-2, P1-1을 재현**했어요. 이 worktree에는 `node_modules`가 없어 실제 앱에서는 돌려보지 않았어요.
  - P0-1은 `BaseTemplateNode.ts`의 코드 모양(`atom: true` + `renderHTML`의 `0`)까지만 직접 대조했어요.
  - 나머지는 호출부를 따라가며 근거를 댄 것이지 재현한 것은 아니에요. 고치기 전에 재현 경로를 먼저 확인하세요. 테스트는 실행하지 않았어요.

계획은 [code-review-plan.md](../code-review-plan.md), 이전 결과는 [01-payments-access.md](01-payments-access.md) · [02-db-rls.md](02-db-rls.md) · [03-responses.md](03-responses.md)를 보세요.

## 이전 단계와 겹치는 것

| 이번 단계 | 이전 단계 |
|---|---|
| P0-3 같은 블록 ID가 두 챕터·책에 들어감 | 2단계 P1-3 (RPC가 블록을 옮김), 3단계 P1-9 (upsert 충돌 키에 `book_id` 없음) |
| P1-15 PUT으로 status/visibility를 바꾸면 구매자가 책을 잃음 | 2단계 P1-1 (`has_book_access`가 구매보다 공개 상태를 먼저 봄) |
| P1-4 체크리스트 항목 키 중복을 가르지 않음 | 3단계 P1-13 (리더의 `parseChecklistItems`), P1-16 (항목 id 길이) |
| P1-7 척도 min/max 해석이 에디터와 다름 | 3단계 P1-11 (`ScaleReader` min/max) |
| P1-8 callout 대체값·프로토타입 키 | 3단계 P1-10 (`TEMPLATE_REGISTRY` 프로토타입 키) |

## 수정 우선순위

1. **P0-1.** 한 줄 수정이지만, 맞다면 워크북 블록이 든 챕터가 저장되지 않아요. `npm install` 뒤 실제 에디터에서 먼저 확인하세요.
2. **P0-2 · P0-3.** ID 부여 플러그인을 한 번에 손봐요. "붙여넣은 쪽에 새 ID, 원래 있던 쪽은 유지"라는 같은 규칙으로 둘 다 풀려요. 2단계 P1-3(RPC가 덮지 않고 충돌 보고)과 같은 PR로 묶으면 겉증상 네 가지(에디터·sync·검수·응답 upsert)가 함께 정리돼요. P2-1(플러그인 하나로 합치기), P2-3(ID 단위 테스트)도 같이.
3. **P0-4.** 본문 길이 검사 + 클라이언트가 `res.ok`를 보게. 크리에이터가 쓴 글이 "저장됨" 뒤에 사라지는 경로예요.
4. **P0-5 · P1-15.** 판매된 책의 삭제·비공개 전환 정책. 2단계 P1-1과 함께 결정.
5. 출간 게이트(P1-12, P1-16, P1-20 ~ P1-26): 우회 경로(P1-16, P1-12)와 통과시키면 안 되는 것(P1-20, P1-21)을 먼저 막고, 잘못 막는 것(P1-22 ~ P1-24)은 나중에.
6. 나머지 P1, P2.

---

## P0 — 크리에이터의 글이나 독자의 답이 사라짐, 돈이 걸림

### P0-1. 워크북 블록을 HTML로 직렬화하면 예외가 남 (재현됨, 앱 미확인)
- 위치: `src/components/editor/extensions/templates/BaseTemplateNode.ts:48`
- 무엇: 다섯 템플릿 노드는 `atom: true`이고 `content` 스펙이 없는 leaf 노드인데, `renderHTML`이 content hole `0`을 돌려줘요. ProseMirror `DOMSerializer`가 `RangeError: Content hole not allowed in a leaf node spec`을 던져요.
- 시나리오: `RichTextEditor`의 `onUpdate`(80행)와 내용 동기화 이펙트(99행)가 모두 `getHTML()`을 불러요. 슬래시 메뉴로 블록을 넣거나 블록이 있는 챕터를 열면 HTML이 `onUpdate`로 넘어가지 않아 저장되지 않고, 이펙트의 예외는 에디터를 무너뜨릴 수 있어요. 블록 복사(클립보드 직렬화)도 같은 이유로 실패해요.
- 고칠 방향: `0`을 빼고 `["section", attrs]`만 반환. 에디터에 블록을 넣고 `getHTML()`이 도는 테스트 추가.
- 2026-10-02 WP0: 실제 확장으로 **재현됨** (다섯 블록 모두, 불러오기·삽입 둘 다). `0` 제거로 풀리는 것도 확인.
- 2026-10-02 WP1: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP1).

### P0-2. 원본보다 위에 붙여넣은 복사본이 원본 ID를 가져감 (재현됨)
- 위치: `BaseTemplateNode.ts:76` `assignNodeIds`
- 무엇: 중복 ID를 가를 때 문서 순서상 첫 노드가 ID를 가져가요. 재현 결과 `A:copy | gen2:P` — 복사본이 A, 원본이 새 ID.
- 시나리오: 독자 응답이 달린 블록 A를 복사해 그보다 위에 붙여넣고 저장 → 원래 자리의 블록은 응답 없는 새 행, 독자 답은 모두 복사본에 붙어 보임. 크리에이터가 "중복"인 복사본을 지우면 응답이 전부 고아가 돼요. `generateNodeId()` 주석의 "절대 재생성하지 않는다"가 깨져요.
- 고칠 방향: 트랜잭션 이전에 있던 노드(`tr.mapping`으로 옛 위치를 매핑)가 ID를 유지하고, 새로 들어온 쪽에 새 ID.
- 2026-10-02 WP4: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP4).

### P0-3. 같은 블록 ID가 두 챕터·두 책에 들어가고, 아무 곳에서도 잡히지 않음
- 위치: `BaseTemplateNode.ts:69-72`(중복 검사가 한 문서 안에서만), `src/lib/publish-checks.ts:128`(챕터 안에서만 중복 제거), `src/lib/publish-checks-loader.ts:40`(`storedBlockIds`가 책 전체의 id만 봄)
- 무엇: 다른 챕터·책에서 복사해 온 블록은 그 문서 안에서는 고유하니 ID를 그대로 써요. `sync_chapter_workbook_blocks`의 `ON CONFLICT (id) DO UPDATE`가 저장할 때마다 행의 `chapter_id`·`book_id`를 마지막으로 저장한 쪽으로 옮겨요.
- 시나리오:
  - 1장 블록 A를 2장에 붙여 저장 → A가 2장으로 이동 → 1장을 저장하면 다시 1장으로. 문항 정의도 두 정의 사이를 오가요.
  - 두 챕터의 독자 답이 같은 `(block_id, field_key)`를 공유해 서로 덮어요. 마지막 sync에서 진 쪽 챕터의 field_key 답은 `rejected`.
  - 2장에서 A를 지우면 RPC가 행을 지워(chapter_id=2장) 1장이 쓰는 정의도 사라져요.
  - 책 X에서 책 Y로 붙이면 X 독자의 답이 Y의 블록으로 묶이거나 거절돼요.
  - 검수는 책 전체에 id가 있기만 하면 통과라 출간 전에 드러나지 않아요. 문구는 "중복을 잡는다"고 해요.
  - 다른 소유자의 블록 id를 가져다 쓰는 공격은 막혀 있어요(RPC가 SECURITY INVOKER, UPDATE RLS가 `is_book_owner`). 그 경우 공격자 쪽 sync가 실패할 뿐이에요.
- 고칠 방향:
  1. 에디터: 붙여넣은 템플릿 노드(`transformPasted` 또는 paste 메타)에는 새 ID. 잘라내기·붙여넣기만 ID를 유지. AGENTS.md의 "block_id 재생성 금지"와 부딪히지 않게 "붙여넣기 시점 1회"로 한정하고 AGENTS.md에 그 예외를 적기.
  2. RPC: 다른 챕터·책의 블록과 충돌하면 덮지 말고 결과로 보고(2단계 P1-3).
  3. 검수: 로더가 `id, chapter_id`를 읽어 챕터 단위로 비교하고, 챕터 사이 중복 id도 blocker로.
- 2026-10-02 WP4: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP4).

### P0-4. 본문 길이 한도를 넘으면 저장이 실패하는데 화면은 "저장됨"
- 위치: `src/app/api/chapters/[chapterId]/route.ts:102`(PUT), `src/app/api/chapters/route.ts:101`(POST), 클라이언트 `EditPageContent.saveChapter`
- 무엇: 서버가 `content_html` 길이를 DB보다 먼저 보지 않아 `chapters.content_html`의 CHECK(`length <= 500000`)에 걸리면 Postgres 원문이 담긴 500을 돌려줘요. 에디터는 이미지를 base64로 본문에 넣으므로(`allowBase64: true`) 한도를 쉽게 넘어요. `saveChapter`는 `res.ok`를 보지 않고 `setSaved(true)`와 쿼리 무효화를 해요.
- 시나리오: 수백 KB 이미지 한 장을 붙여 넣음 → UPDATE 실패 → 화면은 "저장됨" → 다시 불러오면 그동안 쓴 글이 사라져요.
- 고칠 방향: 서버에서 길이를 먼저 검사해 한국어 400. 클라이언트가 실패를 표시. base64 이미지를 업로드 경로(`/api/books/[bookId]/images`)로 돌릴지 결정.
- 2026-10-02 WP1: **수정됨** (길이 검사 + 실패 표시). base64 이미지 처리는 아직 정하지 않음.

### P0-5. 판매된 책을 지우면 구매·결제·독자 답이 CASCADE로 함께 사라짐
- 위치: `src/app/api/books/[bookId]/route.ts:157` DELETE
- 무엇: 판매 여부를 보지 않고 `books`를 지워요. `purchases`·`payment_transactions`·`workbook_responses`가 FK CASCADE로 함께 지워져요.
- 시나리오: 10권 팔린 유료 책을 크리에이터가 삭제 → 구매자의 서재에서 책이 사라지고 환불·정산 근거도 DB에서 없어져요. "돈이 나갔으면 책이 열리거나, 책이 열리지 않으면 돈이 돌아간다"에 어긋나요.
- 고칠 방향: 구매가 있는 책은 삭제 대신 보관(구매자 접근 유지). 결제 기록은 CASCADE가 아니라 RESTRICT/SET NULL로 남길지 2단계와 함께 결정(새 마이그레이션).
- 2026-10-02 WP3: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP3). 결제·구매 FK를 RESTRICT로, 삭제는 409 `HAS_SALES`로 비공개 전환 안내.

## P1 — 저장 정합성·출간 게이트·입력 검증

### 에디터 노드 (`src/components/editor/extensions/templates`, `src/lib/template-node-id.ts`)

- **P1-1. 일부러 비운 문구가 기본 문구로 다시 채워짐 (재현됨).** `ReflectionNode.ts:9`, `ScaleNode.ts`, `CalloutNode.ts`의 `parseHTML`이 `getAttribute(...) || default`라서 `data-prompt=""`가 기본 질문으로 돌아와요. 리더와 `extractWorkbookBlocks`는 빈 값을 그대로 읽어 크리에이터와 독자가 서로 다른 것을 봐요. → 속성이 없을 때만 기본값(`??`).
- **P1-2. `data-items`가 없으면 가짜 항목을 지어냄.** `ChecklistNode.ts:19`가 `DEFAULT_ITEMS`(field_key `item-1`)를 채워요. 다음 저장 때 저자가 쓴 적 없는 "항목 1"이 실제 문항으로 sync되고 검수는 통과해요. "파싱 중에 키를 만들지 않는다"와 어긋나요. → 비어 있으면 빈 목록으로 두고 검수가 잡게.
- **P1-3. id 없는 항목이나 깨진 JSON을 조용히 버리고 다음 편집에서 덮어씀.** `ChecklistNodeView.tsx:9` `parseChecklistItems`. `[{"text":"운동하기"}]`는 "항목 0개"로 보이고, "항목 추가"를 누르면 원래 텍스트가 HTML에서 영구히 지워져요. → 버린 항목을 알리거나 속성에 보존.
- **P1-4. 항목 키(field_key) 중복을 가르는 곳이 없음.** `template-node-id.ts:20` `generateFieldKey`는 "블록 안에서만 고유하면 된다"고 적었지만 검사가 없어요. 업로드·수동 편집으로 같은 id가 두 번 들어오면 RPC의 `DISTINCT ON`이 하나만 남기고, 리더에서는 두 체크박스가 같은 field_key와 DOM id를 공유해 함께 토글돼요. → 블록 ID처럼 항목 키도 중복을 가름(3단계 P1-13과 함께). 2026-10-02 WP4: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP4).
- **P1-5. 처음 불러올 때는 ID가 부여되지 않음.** `BaseTemplateNode.ts:65`. `appendTransaction`에서만 부여해, ID 없는 블록이 있는 챕터를 편집 없이 열면 그대로예요. `setContent(..., {emitUpdate:false})` 중 붙은 ID는 저장되지 않고, 열 때마다 다른 UUID가 생겨요. 검수는 "응답을 받을 수 없는 블록"으로 막는데 에디터는 아무 문제도 보이지 않아요. → onCreate/setContent 경로에서 부여하고 문서를 dirty로 표시해 저장되게. 2026-10-02 WP4: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP4).
- **P1-6. `crypto.randomUUID()`에 대체 경로가 없음.** `template-node-id.ts:11`. 보안 컨텍스트(HTTPS·localhost)와 Safari 15.4+에만 있어요. LAN 주소(`http://192.168.x.x:3000`)로 모바일에서 확인하거나 HTTP 스테이징·구형 Safari에서 블록을 넣으면 `appendTransaction`이 던져 삽입과 이후 편집이 막혀요. 서버(Node)는 영향 없음. → `crypto.getRandomValues`로 UUID v4를 조립하는 대체 경로. 2026-10-02 WP4: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP4).
- **P1-7. 척도 min 0을 1로 바꾸고 범위를 검사하지 않음.** `ScaleNodeView.tsx:10` `parseInt(min) || 1`. 리더와 추출기는 0을 유지해 미리보기가 달라요. `data-max="100000"`이면 node view가 10만 개 span을 그려 에디터가 멈춰요. → 추출기의 `parseIntOr`와 같은 함수 + 범위 제한(3단계 P1-11과 함께).
- **P1-8. callout 대체값이 에디터는 `info`, 리더·폴백·추출기는 `note`.** `CalloutNodeView.tsx:19`. 빈 값이나 모르는 값이면 에디터는 "정보", 독자·PDF/EPUB은 "참고". `rawType in CALLOUT_LABEL`은 `constructor`·`toString` 같은 프로토타입 키도 통과시켜요. → `Object.hasOwn` + 공유 대체값(3단계 P1-10과 함께).

### 챕터 API (`src/app/api/chapters`)

- **P1-9. 새 챕터가 기본으로 `published`이고 `published_at`은 비어 있음.** `chapters/route.ts:99`. 출간된 유료 책에서 "장 추가"를 누르면 빈 "새 장"이 검수 없이 구매자 목차와 리더에 나타나요. PUT은 status를 다시 `published`로 보낼 때만 `published_at`을 찍어 이 챕터는 출간일이 영원히 없어요. 이 장이 맨 앞 published 챕터가 되면 무료 미리보기가 빈 장이 돼요. → 기본값 `draft`.
- **P1-10. `books.total_words` / `total_chapters` 집계가 어긋남.**
  - `[chapterId]/route.ts:151` DELETE가 `total_chapters`만 줄이고 `word_count`는 빼지 않아요. 읽기 시간·"약 N분"·explore 정렬이 영구히 부풀어요.
  - `[chapterId]/route.ts:120`, `route.ts:125`, DELETE(153): 요청 시작 때 읽은 값에 diff를 더해 덮는 read-modify-write라 동시 요청에서 갱신이 유실돼요(1000에 +200, +300 → 1300 또는 1200).
  - `route.ts:128`: draft 챕터도 더해 상세 페이지의 장 수가 구매 후 실제와 달라요. PUT으로 status를 바꿀 때도 조정하지 않아요.
  - → 저장할 때마다 `chapters`에서 published 기준 SUM/COUNT로 다시 계산(트리거나 RPC).
- **P1-11. PUT이 입력을 검증하지 않음.** `[chapterId]/route.ts:78`. `{"title":"   "}`는 빈 제목으로, `{"title":null}`은 문자열 `'null'`로 저장돼요. `{"order_index":"abc"}`는 DB 원문 500, `{"content_html":123}`은 DOMPurify에 숫자가 넘어가요. 본문이 JSON `null`이면 PUT·POST 모두 TypeError로 처리되지 않은 500.
- **P1-12. 출간된 책의 published 챕터는 PUT 한 번으로 검수 없이 반영됨.** `[chapterId]/route.ts:102`. ID 없는 블록을 붙이거나 sync가 실패해도 200과 `workbook_sync.ok=false`만 돌려줘요. 구매자 리더에 저장되지 않는 블록이 그대로 보여요. → 출간 후 편집에도 blocker를 적용할지(저장은 하되 공개 반영을 막는 draft/공개 분리 등) 결정.
- **P1-13. 본문 UPDATE와 블록 sync가 다른 트랜잭션.** `[chapterId]/route.ts:113`. 같은 챕터 저장 A·B가 겹쳐 UPDATE는 A→B, sync는 B→A로 끝나면 본문은 B, 정의는 A. B에서 추가한 문항의 답은 `rejected`, A에만 있던 문항은 유령 정의로 남아요. → 저장된 행의 `content_html`을 다시 읽어 sync하거나 한 트랜잭션으로.
- **P1-14. 챕터 정렬에 동순위 기준이 없음.** `chapters/route.ts:36`. 클라이언트가 삭제 뒤에도 `order_index = chapters.length`를 넣어 같은 값이 생기고(0,1,2 중 1 삭제 → 추가하면 2가 둘), 요청마다 순서가 흔들려요. `book_preview_chapter_id()`(order_index, created_at, id)와도 순서가 달라질 수 있어요. → 서버가 order_index를 정하고, 정렬에 `created_at, id`를 덧붙임.

### 책 API (`src/app/api/books/[bookId]/route.ts`)

- **P1-15. PUT으로 비공개·`unlisted`로 바꾸면 구매자가 책을 잃음.** 93행. `has_book_access()`가 구매자에게도 `published` + `public`을 요구해서, 내리기나 "링크 공유" 선택만으로 구매자의 GET이 404가 돼요. 2단계 P1-1과 같은 근본 원인. → **수정됨 (WP3)** 구매자는 비공개·보관 뒤에도 접근 유지, `unlisted`는 새로 고를 수 없음.
- **P1-16. 출간 게이트를 우회하는 경로들.**
  - 102행: 검수가 status가 published로 바뀌는 순간에만 돌아요. `published` + `private`인 책을 `{visibility:'public'}`만 보내 공개하면 blocker 없이 나가요.
  - 121행: "공개는 status와 visibility를 함께 바꾼다"를 서버가 강제하지 않아요. `{status:'published'}`만 보내면 아무도 못 보는 책에 `published_at`이 찍히고, 이후 visibility 전환은 위 경로로 검수를 건너뛰어요.
  - 106행: status 조회·검수·UPDATE가 따로 왕복해, 검수와 UPDATE 사이에 자동 저장이 sync에 실패하면 이전 스냅샷 기준 통과로 공개돼요(TOCTOU).
  - → 결과적으로 "공개 상태가 된다"(published + public/unlisted)로 바뀌는 모든 전환에서 검수. status 단독 출간은 거절하거나 visibility를 함께 설정.
- **P1-17. PUT 본문을 런타임에 검증하지 않음.** 93행. 본문이 `null`이면 `'title' in null`이 TypeError로 500. `{title:null}`·`{status:'PUBLISHED'}`는 DB 원문 500. `{status:'processing'}`이나 임의 `language`는 그대로 저장. 출간된 책에 `{title:''}`을 보내면 검수의 "제목이 비어 있어요"를 건너뛰어 제목 없는 공개 책이 돼요.
- **P1-18. `cover_image_url`에 아무 문자열이나 받음.** 89행. `/cover` 업로드의 검증과 이전 파일 정리를 거치지 않아요. 외부 추적 픽셀 URL이 OG 메타·공개 카드에 노출되고 기존 커버는 고아로 남아요. `.../covers/<남의 bookId>/a.png`를 넣고 `DELETE /cover`를 부르면 cover 라우트가 그 경로로 `storage.remove()`를 불러요 — 실제로 지워지는지는 `covers` 버킷 정책(마이그레이션에 없음, 대시보드 관리로 보임)에 달려 있어요. 5단계(`/cover`)와 함께.
- **P1-19. DELETE의 선행 `chapters` 삭제가 결과를 보지 않고 트랜잭션도 아님.** 155행. chapters 삭제 성공 뒤 books 삭제가 실패하면 500인데 본문과(CASCADE로) 독자 답은 이미 사라져요. FK CASCADE와 겹쳐 필요하지도 않아요. → books 삭제 하나로(P0-5의 정책 결정 뒤). → **수정됨 (WP3)**

### 공개 전 검수 (`src/lib/publish-checks.ts`, `src/lib/publish-checks-loader.ts`)

- **P1-20. 모든 챕터가 draft여도 경고만 나와 빈 책이 공개됨.** `publish-checks.ts:173`. 독자 GET은 published 챕터만 보여 구매자는 빈 책을 받고, `book_preview_chapter_id()`도 미리보기를 못 찾아요. 크리에이터 미리보기는 소유자라 draft가 보여 문제를 볼 수 없어요. → published 챕터 0개는 blocker.
- **P1-21. 미동기화 검사가 블록 ID만 보고 문항은 보지 않음.** `publish-checks.ts:132`, `publish-checks-loader.ts:40`. 이미 저장된 블록에 항목을 추가하고 저장했는데 sync만 실패하면 검수를 통과하고, 출간 뒤 새 field_key의 답은 전부 `rejected`. "공개 전 검수가 본문과 DB가 어긋난 상태를 차단합니다"가 지켜지지 않아요. → 로더가 `workbook_block_fields`까지 읽어 추출 결과의 field_key 집합과 비교.
- **P1-22. 독자에게 보이지 않는 draft 챕터가 blocker를 만듦.** `publish-checks.ts:97`, `publish-checks-loader.ts:36`. 빈 draft 6장이나 ID 없는 블록이 든 draft 때문에 출간이 막혀요. draft의 블록이 `totalBlocks`에 들어가 "워크북 블록 없음" 경고도 가려져요. → 본문 검사는 published 챕터만.
- **P1-23. 이미지만 있는 챕터를 빈 챕터로 판정.** `publish-checks.ts:62` `isEmptyChapter`가 태그를 전부 지워요. 삽화·도표 한 장짜리 장이 blocker가 돼요. → `img` 등 텍스트 없는 콘텐츠를 비어 있지 않은 것으로.
- **P1-24. 빈 제목·빈 챕터가 blocker — AGENTS.md 규칙과 어긋남.** `publish-checks.ts:77,100`. AGENTS.md는 "차단은 크리에이터가 자기 화면에서 확인할 수 없는 것만"이라고 해요. 둘 다 에디터에서 보여요. 다만 빈 제목은 P1-17처럼 공개 뒤에 생길 수 있으니, 경고로 내릴지 규칙 문구를 고칠지 **결정이 필요**해요.
- **P1-25. 쿼리 에러를 삼켜 DB 장애가 거짓 blocker로 보임.** `publish-checks-loader.ts:26,34`.
  - books 조회 에러 → `not-found` → 자기 책인데 404 "Book not found".
  - chapters 에러 → "장이 하나도 없어요".
  - workbook_blocks 에러 → `storedBlockIds=[]` → 모든 블록이 "unsynced", 고칠 수 없는 재저장 안내.
  - → `{ ok: false, reason: 'error' }`로 돌려 호출부가 500.
- **P1-26. `workbook_blocks` 조회가 1000행에서 잘림.** `publish-checks-loader.ts:40`. 정렬·범위가 없어 PostgREST 기본 `max_rows`에 걸리면 임의의 1000개만 와요. 동기화가 다 된 챕터가 호출마다 다르게 "unsynced"로 막혀 출간이 영구히 막혀요(3단계 P1-3과 같은 종류).

## P2 — 정리·효율

- **P2-1. 템플릿 노드 5종이 각자 ID 플러그인을 등록.** `BaseTemplateNode.ts:53`. 키 입력마다 `doc.descendants`가 5번 돌아요. 긴 챕터에서 입력 지연. → 템플릿 타입 집합을 다루는 플러그인 하나로, 가능하면 `tr.mapping`의 변경 범위만 검사. P0-2와 함께. 2026-10-02 WP4: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP4).
- **P2-2. 라벨·기본값·타입 목록이 에디터와 리더에 따로 복사돼 있음.** `CalloutNodeView.tsx:7`(`CalloutType`, `CALLOUT_LABEL`이 `CalloutReader`의 사본), 각 Node의 `parseHTML` 기본값, node view의 `?? default`(attrs가 null이 아니라 죽은 코드). 이미 P1-8에서 어긋났어요. → `src/lib/workbook`에 한 벌.
- **P2-3. 블록·항목 ID 규약에 단위 테스트가 없음.** `generateNodeId`·`generateFieldKey`·`assignNodeIds`. 중복 분리, 붙여넣기 순서, 기존 ID 보존, 보안 컨텍스트 밖 동작 어느 것도 회귀를 잡지 못해요. P0-2도 테스트가 없어 남아 있었어요. 2026-10-02 WP4: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP4).
- **P2-4. 챕터 GET이 `checkBookAccess()` 대신 `visibility`를 직접 봄.** `chapters/route.ts:27`, `[chapterId]/route.ts:33`. RLS가 이미 숨겨 403 분기는 닿지 않는 죽은 코드이고, AGENTS.md "접근 판정은 `checkBookAccess()` 하나" 위반.
- **P2-5. 책 PUT의 영문·DB 원문 에러가 화면에 뜸.** `books/[bookId]/route.ts:107`. `PublishChecklist`, `EditPageContent.handleMetaSave`가 `json.error`를 그대로 띄워요("Book not found", `violates check constraint ...`). AGENTS.md "사용자 노출 문구는 한국어로".
- **P2-6. 책 GET이 인증 왕복을 하나 더 직렬로 함.** `books/[bookId]/route.ts:22`. `getAuthUser()`가 클라이언트를 따로 만들고, 그 결과는 RLS가 이미 하는 `isOwner` 필터에만 쓰여요. 판정 기준이 두 곳에 생겨요. → 없애거나 `Promise.all`.
- **P2-7. 로더가 호출부가 이미 읽은 `books`를 다시 순차로 조회.** `publish-checks-loader.ts:26`. 매 호출 3번 순차 왕복이고 `not-found` 분기는 사실상 죽은 코드. → 호출부가 행을 넘기거나 나머지 쿼리와 `Promise.all`.
- **P2-8. 로더가 소유자 확인을 RLS에 맡기고 계약에 적지 않음.** `publish-checks-loader.ts:22`. 비소유자가 부르면 공개 책의 published 챕터와 접근 가능한 블록만으로 판정해요. → 함수 계약에 "소유자 확인 후 호출" 명시 또는 내부 확인.
- **P2-9. 로더가 `as PublishCheckChapter[]`, `block.id as string`으로 행 모양을 강제.** `publish-checks-loader.ts:47`. 스키마가 바뀌면 컴파일러가 못 잡고 런타임 TypeError로 500.
- **P2-10. 챕터마다 HTML을 세 번 파싱.** `publish-checks.ts:120`. `isEmptyChapter`, `countWorkbookBlockElements`, `extractWorkbookBlocks`. 미리보기 패널이 다시 불러올 때마다 반복. → 한 번 파싱해서 셋을 모두 도출.
- **P2-11. 블록이 callout뿐이어도 "답할 곳이 없음" 경고가 안 뜸.** `publish-checks.ts:123` `totalBlocks`에 callout이 들어가요. → 문항이 있는 블록만 세기.
- **P2-12. 이름 없는 챕터를 `order_index + 1`장으로 부름.** `publish-checks.ts:66`. 삭제로 index에 틈이 생기면(0, 2, 5) 실제 3번째 장을 "6장"이라고 안내해요. → 정렬된 배열의 순번.

## 다음 세션에서 할 일

1. `npm install` 뒤 P0-1을 실제 에디터에서 확인하고 고치기(`0` 제거). 블록 삽입 → `getHTML()` 테스트.
2. ID 부여 플러그인 정리 한 PR: P0-2(기존 노드가 ID 유지), P0-3(붙여넣은 블록에 새 ID), P1-5(초기 로드 시 부여·저장), P1-6(UUID 대체 경로), P2-1(플러그인 하나), P2-3(단위 테스트). 2단계 P1-3(RPC 충돌 보고)과 3단계 P1-9를 같이 결정하고, AGENTS.md의 "재생성 금지"에 붙여넣기 예외를 적기.
3. P0-4: 챕터 본문 길이 검사(400, 한국어) + `saveChapter`의 `res.ok` 확인. P1-11도 같은 PR.
4. 정책 결정 필요: P0-5(판매된 책 삭제), P1-15(판매된 책 비공개 전환 — 2단계 P1-1), P1-12(출간 후 편집에 검수 적용), P1-24(빈 제목·빈 챕터를 blocker로 둘지).
5. 출간 게이트: P1-16(모든 공개 전환에서 검수), P1-20 ~ P1-23, P1-25, P1-26. 로더를 `id, chapter_id` + fields까지 읽도록 바꾸면 P0-3의 검수 부분과 P1-21이 함께 풀려요.
6. 테스트: `rls.test.ts`/`workbook-sync.test.ts`에 챕터 사이 중복 id, 출간 검수 단위 테스트(draft만 있는 책, 이미지만 있는 장, 문항 미동기화, 쿼리 실패), 챕터 API(길이 초과 → 400, 집계 재계산).
7. 수정 후 `npm run typecheck && npm test && npm run lint`.
