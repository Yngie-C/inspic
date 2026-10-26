# 12단계 리뷰 결과 — 저작 에디터 변경

- 날짜: 2026-10-25
- 실행 (경로마다 따로, 워크트리 `orca/workspaces/inspic/code-review-11`):
  ```
  /code-review medium src/components/editor
  /code-review medium src/lib/sanitize.ts
  /code-review medium src/components/dashboard/BookMetadataForm.tsx
  ```
- 대상 커밋: `ed99a1b` (11-A 병합 뒤)
- 원 지적 28건(editor 10 · sanitize 10 · BookMetadataForm 8). 겹치는 것이 없어 **28건 (P0 2 · P1 14 · P2 12)**.
  - 지적 번호 뒤 괄호는 원 출력의 경로·순번이에요(`E` editor, `S` sanitize, `M` BookMetadataForm).
  - M-3(`maxLength`가 UTF-16으로 셈)은 11-A에서 "서버보다 엄격한 쪽이라 그대로 둔다"고 정한 것이라 P2-10으로만 적고 고치지 않아요.
- **검증 상태**
  - 직접 대조함: P0-1(`workbook-blocks.ts:91` `NodeSelection`만 따로 다루고 나머지는 `insertContent`), P1-1(`sanitize.ts:19` `class`가 모든 요소에 열려 있음. 에디터 확장은 `class`를 내지 않음), P1-2(`sanitize.ts:14` `label`·`textarea`와 `placeholder`·`rows`·`readonly` 등이 허용 목록에 있음), P1-4(`sanitize.ts:10` `del`·`sub`가 목록에 없음), P1-6(`BlockExitOnEnter.ts:5` 우선순위 150, `SlashCommand.ts`는 우선순위를 정하지 않아 기본 100), P1-7(`BlockExitOnEnter.ts:21` `splitBlock().setNode("paragraph")`), P1-8(`SlashCommandMenu.tsx:55` 결과가 없어도 Enter에 `true`), P1-9(`RichTextEditor.tsx:68` `allowBase64: true`), P1-11(`BookMetadataForm.tsx:70` `catch {}`가 던진 메시지를 버림), P2-4(`sanitize.ts:55` 대소문자 구분 비교), P2-9의 `key={selectedChapter.id}`(`EditPageContent.tsx:632`).
  - 중점으로 적은 "위 첨자가 PDF 폴백까지 맞는지"는 `pdf-generator.tsx:400`이 `<sup>`를 조각으로 나누고 테스트(`pdf-generator.test.tsx:150`)가 있어 지적이 나오지 않았어요.
  - 나머지는 리뷰 출력 그대로이고, 테스트·앱 확인은 하지 않았어요. medium이라 리뷰 안에서 검증 단계도 돌지 않았어요.

계획은 [code-review-plan.md](../code-review-plan.md), 이전 결과는 [11-publish-path.md](11-publish-path.md)를 보세요.

## 공통 원인 네 가지

1. **sanitize 허용 목록이 에디터가 내는 것과 맞춰져 있지 않다.** 에디터가 내지 않는 것(`class`, `textarea`·`label`, 입력란 속성)은 열려 있어 `style`·`input`을 막은 방어를 한 칸 옆으로 돌아가게 하고(P1-1·P1-2·P1-3), 업로드 경로가 내는 것(`del`·`sub`·`colspan`)은 빠져 조용히 사라져요(P1-4·P1-5). 기준이 "에디터·업로드가 실제로 내는 태그·속성"이 아니라 손으로 고른 목록이에요.
2. **블록을 넣는 입구가 선택 범위를 다 보지 않는다.** 블록 하나를 고른 경우만 덮어쓰기를 막고, 전체 선택·여러 블록 선택은 그대로 바꿔 넣어요(P0-1). 같은 입구에서 키 처리 우선순위가 엇갈려 슬래시 메뉴의 Enter를 제목 처리가 먼저 가져가요(P1-6·P1-8).
3. **크기 검사가 비싼 일 뒤에 있다.** 본문 길이 검사가 sanitize(jsdom 파싱) 뒤라 큰 요청 하나가 서버를 붙잡고(P0-2), 에디터는 base64 이미지를 본문에 넣어 상한을 넘긴 뒤에야 저장이 막혀요(P1-9).
4. **메타데이터 폼이 서버와 따로 논다.** 서버가 알려 준 거절 사유를 버리고(P1-11), 고치지 않은 필드·숨긴 필드까지 늘 실어 보내 옛 데이터 하나로 저장이 통째로 막히고(P1-12·P1-13), 마운트할 때 한 번 읽은 값으로 나중에 최신 값을 덮어요(P1-14).

## P0

| # | 위치 | 지적 |
|---|---|---|
| P0-1 | `editor/workbook-blocks.ts:94` (E-1) | `insertWorkbookBlock`이 `NodeSelection`만 보호함 → Cmd+A나 체크리스트에 걸친 드래그 선택 상태에서 툴바 '워크북 블록'을 고르면, 선택한 내용(독자 답이 달린 공개 블록 포함)이 새 블록 하나로 바뀜. 자동 저장 뒤 그 블록 ID들이 장에서 빠져 답이 전부 고아가 됨. 함수 주석이 막는다고 적은 바로 그 손실. |
| P0-2 | `lib/sanitize.ts:80` (S-4) | 서버 sanitize가 크기 검사 전에 입력 전체를 jsdom으로 동기 파싱함. 장 라우트는 sanitize 뒤에 `isChapterHtmlTooLong`을 봄 → 로그인한 사용자가 `PUT /api/chapters/[id]`에 수십 MB짜리 중첩 `<div>`를 보내면 그 인스턴스가 몇 초씩 멈추고 나서야 "너무 김"으로 거절. 11-P0-1(ReDoS)과 같은 종류. |

## P1

| # | 위치 | 지적 |
|---|---|---|
| P1-1 | `lib/sanitize.ts:19` (S-1) | `class`가 모든 요소에 값 제한 없이 열림 → 번들에 이미 있는 Tailwind 유틸(`fixed inset-0 z-50 bg-surface`)로 리더 전체를 덮는 가짜 결제·로그인 안내를 심을 수 있음. `style` 훅(33~38행)이 막으려던 공격 그대로. 에디터는 `class`를 내지 않음. |
| P1-2 | `lib/sanitize.ts:14` (S-2) | `textarea`·`label`과 `placeholder`·`value`·`rows`·`cols`·`readonly`·`disabled`가 허용됨. 저장되는 블록은 `section` + `data-*`라 이것들을 내는 곳이 없음 → `<label>카드 번호</label><textarea placeholder="0000-…">`로 checkbox 외 `input`을 지운 방어를 태그 하나 바꿔 우회. |
| P1-3 | `lib/sanitize.ts:55` (S-3) | 워크북 블록 밖의 checkbox `input`·`textarea`가 리더에서 살아 있는 입력으로 그려지지만 `WorkbookResponsesProvider`와 연결이 없음 → Markdown 할 일 목록(`- [ ] 할 일`)을 올리면 체크할 수 있는 상자가 되고, 새로고침하면 사라짐. "저장되는 줄 알았는데 아니었다"를 만듦. |
| P1-4 | `lib/sanitize.ts:10` (S-5) | `del`·`sub`가 허용 목록에 없음 → Markdown `~~옛 가격~~`(marked → `<del>`)이 일반 글로 남아 옛 가격이 지금 가격처럼 읽히고, DOCX의 CO<sub>2</sub>가 CO2가 됨. 5행 주석이 말하는 바로 그 조용한 손실. |
| P1-5 | `lib/sanitize.ts:18` (S-6) | `colspan`·`rowspan`이 없음 → DOCX의 병합 머리칸(`<th colspan="3">`)이 한 칸이 되어 뒤 열이 전부 밀리고, 리더·PDF의 표가 다른 데이터를 보여 줌. |
| P1-6 | `editor/extensions/BlockExitOnEnter.ts:21` (E-2) | 우선순위 150이 슬래시 메뉴(Suggestion, 기본 100)보다 먼저 Enter를 받음 → 제목 줄에서 `/체크` 입력 후 Enter를 누르면 블록은 안 들어가고 제목이 `/체크` + 빈 문단으로 갈라지며 메뉴가 깨진 채 남음. 제목에서는 클릭으로만 넣을 수 있음. |
| P1-7 | `editor/extensions/BlockExitOnEnter.ts:21` (E-3) | 비어 있지 않은 제목의 맨 앞에서 Enter → `splitBlock`이 빈 제목을 위에 두고 커서를 글이 남은 아래 칸에 둔 뒤 그 칸을 문단으로 바꿈. 위에 빈 줄을 만들려던 저자의 장 제목이 말없이 본문 글씨가 됨. |
| P1-8 | `editor/SlashCommandMenu.tsx:55` (E-4) | 결과가 0개여도 Enter에 `true`를 돌려 키를 삼킴. 화살표는 `% items.length`(0)로 `selectedIndex`가 NaN → `/usr/local`·`/2`로 시작하는 줄에서 Esc나 공백 전까지 줄을 못 바꾸고, 화살표를 먼저 누르면 강조가 사라짐. |
| P1-9 | `editor/RichTextEditor.tsx:68` (E-5) | `allowBase64: true`라 붙여넣거나 끌어 넣은 이미지가 `data:` URI로 `content_html`에 들어감(DOMPurify는 `img`의 `data:`를 기본 허용) → 스크린샷 몇 장이면 50만 자 상한을 넘어 그 뒤 저장이 모두 실패. 주석의 "Storage에 올리고 base64는 넣지 않는다"와 반대. |
| P1-10 | `dashboard/BookMetadataForm.tsx:110` (M-4) | `maxLength`가 붙여넣은 긴 글을 안내 없이 자름 → 2,400자 소개를 붙이면 2,000자에서 잘린 채 저장·공개됨. 서버가 400으로 알려 주던 경로가 조용한 손실로 바뀜(11-A가 붙인 `maxLength`). |
| P1-11 | `dashboard/BookMetadataForm.tsx:70` (M-1) | `catch {}`가 `onSave`(`handleMetaSave`)가 던진 서버 문구를 버리고 늘 "저장하지 못했어요. 다시 시도해 주세요." → 11-A가 새로 낸 400("소개글은 2,000자까지…")을 저자가 못 보고 같은 요청을 반복. |
| P1-12 | `dashboard/BookMetadataForm.tsx:61` (M-2) | 고친 필드만이 아니라 title·description·audience·detail_image_alt·language를 늘 함께 보냄 → 상한이 생기기 전에 3,000자 소개글을 저장한 책은 언어만 바꿔도 400이고, P1-11 때문에 이유도 안 보임. `maxLength`는 이미 든 값을 자르지 않아 화면에선 드러나지 않음. |
| P1-13 | `dashboard/BookMetadataForm.tsx:65` (M-6) | 소개 이미지를 지워 대체 글 칸이 숨겨져도 `detail_image_alt`가 그대로 실림 → 보이지 않는 옛 대체 글이 남거나, 그 값이 거절되면 저자가 고칠 수 없는 칸 때문에 저장이 막힘. |
| P1-14 | `dashboard/BookMetadataForm.tsx:42` (M-7) | 폼 상태를 마운트할 때 `book`으로 한 번만 정하는데, 폼은 서랍이 닫혀 있어도 늘 마운트됨 → 다른 탭에서 제목·소개를 바꾼 뒤 이 화면에서 언어만 바꿔 저장하면 옛 제목·소개로 덮음. |

## P2

| # | 위치 | 지적 |
|---|---|---|
| P2-1 | `lib/sanitize.ts:19` (S-7) | `img src`가 외부 URL·`data:`를 모두 받음 → 추적 픽셀로 구매 독자의 IP·읽은 시각이 외부로 나가고, 이미지를 나중에 바꿔치기할 수 있음. 내보내기는 우리 Storage 이미지만 담아(`loadStorageImage()`) 리더와 EPUB 내용이 달라짐. 처리는 결정 2. |
| P2-2 | `editor/RichTextEditor.tsx:51` (E-6) | Tiptap v3 `useEditor`는 기본으로 트랜잭션마다 다시 그리지 않음 → 커서를 굵은 글씨·링크·제목에 옮겨도 툴바 버튼이 켜지지 않고, 빈 선택에서 Cmd+B는 문서가 안 바뀌어 끝내 표시 안 됨. |
| P2-3 | `editor/extensions/templates/TemplateNodeIds.ts:120` (E-7) | NodeView의 `updateAttributes`가 리프 노드에서 `replaceWith`가 되어, 블록 칸에 한 글자 칠 때마다 "블록이 들어옴"으로 잡힘 → 문서 전체 정리·체크리스트 `data-items` JSON 파싱·`forgetIdsPresentIn`이 키마다 돌아 블록 많은 긴 장에서 입력이 느림. ID가 그대로이고 겹치지 않으면 건너뛰기. |
| P2-4 | `lib/sanitize.ts:55` (S-8) | `getAttribute("type") !== "checkbox"`가 대소문자를 구분 → 붙여넣은 `type="CHECKBOX"`가 지워짐. `toLowerCase()`. P1-3을 고치면 함께 정리됨. |
| P2-5 | `editor/RichTextEditor.tsx:118` (E-8) | 부모가 매 입력을 `content`로 돌려줘 외부 동기화 이펙트가 키마다 `getHTML()`을 한 번 더, 글자 수가 렌더마다 `getText()`를 돎 → 10만 자 장에서 입력 지연. 처음 불러올 때만 동기화하고 글자 수는 `onUpdate`에서. |
| P2-6 | `lib/sanitize.ts:80` (S-9) | 전역 DOMPurify에 훅을 호출마다 붙였다 뗌 → 다른 모듈이 전역 훅을 걸면 본문 sanitize에도 걸림. 이 파일 전용 인스턴스에 훅을 한 번만 걸기. |
| P2-7 | `lib/sanitize.ts:97` (S-10) | `sanitizeContent`·`sanitizeForRender`가 같은 함수 → 이름이 서버·클라이언트 정책이 다른 것처럼 보이고, 한쪽만 고치면 저장본과 렌더본이 갈라짐. 하나로. |
| P2-8 | `editor/RichTextEditor.tsx:107` (E-9) | 장 전환 이펙트·`prevChapterRef`·`debounceRef`가 죽은 코드(`EditPageContent`가 `key={selectedChapter.id}`로 다시 마운트, `debounceRef`는 대입되지 않음) → 누가 `key`를 빼면 옛 장 본문이 새 장에 들어가는 버그가 되살아남. |
| P2-9 | `editor/EditorMenuBubble.tsx:109` (E-10) | `addLink`가 `EditorToolbar.tsx:139`와 같은 복사본, `SlashCommand.ts`의 팝업 위치 계산도 `onStart`·`onUpdate`에 두 벌 → `promptAndSetLink(editor)`, `positionPopup(popup, rect)`로. |
| P2-10 | `dashboard/BookMetadataForm.tsx:110` (M-3) | `maxLength`는 UTF-16, 서버 `textLength()`·DB는 코드포인트 → 이모지가 섞이면 화면이 먼저 막음. **11-A에서 그대로 두기로 정함**(서버보다 엄격한 쪽). 고치지 않음. |
| P2-11 | `dashboard/BookMetadataForm.tsx:97` (M-5) | 화면은 앞뒤 공백까지 세고 서버는 `trim` 뒤에 셈 → 공백이 섞인 글을 붙이면 서버가 받을 글도 잘림. P1-10을 고치면 함께 사라짐. |
| P2-12 | `dashboard/BookMetadataForm.tsx:69` (M-8) | 저장 성공 시 `handleMetaSave`가 서랍을 바로 닫아 "저장됨"이 안 보이고, 2초 `setTimeout`을 정리하지 않아 연속 저장 때 엉뚱한 때 꺼짐. |

## 수정 묶음

묶음 이름은 `12-`를 붙여요. 한 묶음 = 한 PR. 순서는 **12-A → 12-B → 12-D → 12-C**예요.

- 12-A는 P0-2(서버를 붙잡는 요청)와 sanitize 우회라 먼저 해요. `sanitize.ts`와 장 라우트 두 곳만 만지고 다른 묶음과 겹치지 않아요.
- 12-B는 P0-1(독자 답 고아화)이라 12-A 다음. 에디터 확장 파일만 만져요.
- 12-D는 `EditPageContent.tsx`의 `handleMetaSave`를 건드리므로 **11-B를 병합한 뒤** 그 위에서 해요(11-B·11-D가 같은 파일).
- 12-C(성능·정리)는 급하지 않아 마지막. P2-3은 블록 ID 규칙을 건드리므로 12-B 뒤에 해요.

| 묶음 | 지적 | 비고 |
|---|---|---|
| 12-A. sanitize를 에디터·업로드에 맞추기 | P0-2, P1-1~5, P2-1, P2-4, P2-6, P2-7 | `sanitize.ts`, 장 라우트(`api/chapters`, `api/chapters/[chapterId]`), `upload-parser.ts`의 크기 검사 위치. 결정 1·2. |
| 12-B. 블록 입구와 키 처리 | P0-1, P1-6~9, P2-2 | `workbook-blocks.ts`, `BlockExitOnEnter.ts`, `SlashCommandMenu.tsx`, `RichTextEditor.tsx`(이미지 설정·리렌더). 결정 3. |
| 12-C. 에디터 성능·정리 | P2-3, P2-5, P2-8, P2-9 | `TemplateNodeIds.ts`, `RichTextEditor.tsx`, `EditorMenuBubble.tsx`·`EditorToolbar.tsx`·`SlashCommand.ts`. |
| 12-D. 메타데이터 폼 | P1-10~14, P2-11, P2-12 | `BookMetadataForm.tsx`, `EditPageContent.tsx`의 `handleMetaSave`. 11-B 뒤. |

### 묶음 12-A 계획 — sanitize를 에디터·업로드에 맞추기

**1. 크기 먼저 (P0-2)** — 장 PUT·POST와 업로드 파서에서 원문 길이를 sanitize **전에** 봄. 상한은 `isChapterHtmlTooLong`의 상한보다 넉넉한 원문 상한(예: 2배)으로 먼저 400, sanitize 뒤 기존 검사는 그대로. 테스트: 상한을 넘는 본문이 sanitize를 부르지 않고 400인지(sanitize를 spy).

**2. 허용 목록을 실제 출력에 맞추기 (P1-1·P1-2·P1-4·P1-5)** — `class`는 결정 1대로 `code`의 `language-*`만 훅에서 남김. `textarea`·`label`과 `placeholder`·`value`·`rows`·`cols`·`readonly`·`disabled`·`name`·`for`는 뺌(저장 HTML에 내는 곳이 없음을 `grep`으로 다시 확인). `del`·`sub`, `colspan`·`rowspan`을 더함. 더한 태그는 EPUB(`toXhtml`)·PDF(`stripHtmlForPdf`)가 어떻게 다루는지 확인 — PDF는 `sub`를 `sup`처럼 조각으로 나누거나 일반 글로 두고, `pdf-fallback-glyphs.test.ts`가 통과하는지.

**3. 블록 밖 입력 (P1-3·P2-4)** — 워크북 블록(`section[data-template-type]`) 밖의 `input`은 전부 지움. Markdown 할 일 목록은 업로드 파서에서 `[ ]`/`[x]` 글자로 바꿔 내용을 남김. 블록 안 checkbox는 저장 HTML에 없으므로(답은 `workbook_responses`) 블록 안에서도 남길 이유가 있는지 확인하고, 없으면 `input`을 목록에서 뺌.

**4. 이미지 주소 (P2-1)** — 결정 2(우리 Storage만). `img src`가 `chapter-images` 공개 버킷 URL(`isStorageImageUrl()`과 같은 origin·경로 판정에 버킷 이름까지)이 아니면 `src`를 지우고, `alt`가 있으면 그 글을 남김. 판정은 `lib/storage-image.ts`에 함수 하나로 두고 sanitize·내보내기(`loadStorageImage()`)가 함께 씀.
  - **DOCX 업로드가 먼저예요.** mammoth는 기본으로 문서 안 이미지를 `data:` URI로 내므로, 이 검사만 넣으면 DOCX 원고의 그림이 전부 사라져요. `convertToHtml`에 `convertImage`를 넘겨 이미지를 `chapter-images/{bookId}/…`에 올리고 그 URL을 넣음(올리지 못한 이미지는 대체 글로 남기고 업로드 결과에 개수를 실어 알림). 이렇게 하면 DOCX 그림이 본문 상한을 넘기던 문제도 함께 사라져요.
  - Markdown 원고의 외부 이미지(`![](https://…)`)는 서버가 받아 오지 않고 대체 글로 남김(서버가 아무 주소나 받아 오면 SSRF가 됨). 업로드 결과에 "외부 이미지 n개는 넣지 못했어요"를 실음.
  - 이미 저장된 장 중 외부·`data:` 이미지가 있는 장은 다음 저장 때 이미지가 빠짐. 운영 DB에서 수를 먼저 보고(결정 2의 SQL), 0이 아니면 편집 화면이 그 장을 열 때 "외부 이미지는 저장되지 않아요. 다시 올려 주세요"를 띄움.

**5. 인스턴스와 이름 (P2-6·P2-7)** — `DOMPurify(window)`로 이 파일 전용 인스턴스(서버는 isomorphic-dompurify가 주는 jsdom window)를 만들고 훅은 모듈 로드 때 한 번. 함수는 `sanitizeContent` 하나로 두고 `sanitizeForRender`는 같은 함수를 다시 내보내는 별칭으로(호출처 4곳은 그대로).
  - Vercel에서 isomorphic-dompurify 2.26.0 고정(PR #18)을 깨지 않게, 새 import 없이 기존 패키지가 주는 것만 씀.

**6. 확인** — `sanitize.test.ts`에 `class` 오버레이, `textarea` 피싱, 블록 밖 checkbox, `del`·`sub`·`colspan`, 대문자 `CHECKBOX`. 기존 본문이 바뀌지 않는지 보려고 `content/`의 원고와 테스트 픽스처를 sanitize 전후로 비교. `npm run typecheck && npm test && npm run lint`(에러 9개 이하), `npm run build`.

> 2026-10-26 수정함(브랜치 `Yngie-C/code-review-12a`, 마이그레이션 없음, 10건). P0-2는 원문 상한 `MAX_RAW_CHAPTER_HTML_LENGTH`(저장 상한의 2배, `isRawChapterHtmlTooLong()`)을 장 PUT·POST와 업로드 파서(`UploadChapterTooLongError`)가 sanitize **전에** 봐요. 허용 목록에서 `textarea`·`label`과 `name`·`for`·`value`·`placeholder`·`rows`·`cols`·`readonly`·`disabled`·`min`·`max`를 빼고 `del`·`sub`·`colspan`·`rowspan`(세 자리 숫자만)을 더했어요. `class`는 `code`의 `language-[a-z0-9-]+`만, `img src`는 `chapter-images`만(`isChapterImageUrl()`, `storage-image.ts`) 남고 아니면 대체 글이 글자로 남아요. 내보내기 `loadStorageImage()`도 같은 함수를 써서 `covers`·`data:`를 더는 담지 않아요. DOCX 그림은 mammoth `convertImage`로 바이트만 모았다가 책을 만든 뒤 `chapter-images/{bookId}/{chapterId}/`에 올리고(장 ID를 미리 정해 넣음), 못 올린 그림·버킷이 받지 않는 형식·Markdown 바깥 주소 그림은 대체 글로 남기고 업로드 응답 `images.dropped`로 세어 업로드 화면이 알려요. 책을 만든 뒤 실패하면 책과 올린 그림을 지워요. PDF는 `del`·`sub`를 내용만 남겨 "CO 2"로 찍히지 않게만 했어요(모양은 13-E).
> - **계획과 다르게 한 것 두 가지.** (1) 체크 상자: `input`을 지우기만 하면 이미 저장된 Markdown 원고의 할 일 목록 표시가 사라져서, 업로드 파서가 아니라 **sanitize가** checkbox `input`을 `[ ]`/`[x]` 글자로 바꾸고(대소문자 무시, P2-4) 나머지 `input`은 지워요. 저장본·렌더본·옛 장 모두 한 규칙이에요. (2) 전용 DOMPurify 인스턴스: isomorphic-dompurify 2.26.0은 서버에서 jsdom window를 내주지 않고, jsdom을 직접 부르면 Vercel require(esm) 문제(PR #18)를 다시 밟아요. 그래서 **훅을 아예 쓰지 않고** `RETURN_DOM`으로 받은 DOM에서 값을 좁혀요(지우거나 줄이기만 함). `sanitizeForRender`는 `sanitizeContent`의 별칭이에요.
> - 테스트: `sanitize.test.ts`(입력란·`class`·업로드 서식·이미지 주소), `sanitize.server.test.ts`(node 경로), `chapters-route.test.ts`(원문 상한 초과 시 sanitize를 부르지 않고 400 — spy), `upload-parser.test.ts`(원문 상한, 할 일 목록, 취소선, DOCX 그림 업로드·실패·바깥 주소), `upload-route.test.ts`(새로 — 책 생성 전 거절, 그림 경로가 장 ID와 같음, 실패 시 책·그림 정리), `storage-image`·`content-stats`·`epub-generator`·`pdf-generator` 테스트. 새 sanitize·장 라우트 회귀 테스트는 고치기 전 코드에서 실패하는 것을 확인했어요. `content/`의 Markdown 원고 25개를 옛·새 sanitize로 비교해 달라진 것은 할 일 목록의 체크 상자 → `[ ]`뿐이에요.
> - 확인하지 않은 것: 앱 화면(DOCX 그림이 든 원고 업로드, 업로드 화면 안내 문구), 실제 Storage 업로드. 운영 DB에 `<input type="checkbox">`가 든 장이 있으면 리더에서 `[ ]` 글자로 보이게 바뀌어요(의도).

### 묶음 12-B 계획 — 블록 입구와 키 처리

**1. 선택 범위 (P0-1)** — `insertWorkbookBlock`이 선택이 비어 있지 않으면(NodeSelection·AllSelection·범위 TextSelection 모두) 선택을 지우지 않고 `selection.to` 뒤에 넣음. 슬래시 경로(`range`)는 `/검색어`만 지우므로 그대로. 테스트: 전체 선택·블록에 걸친 텍스트 선택에서 넣은 뒤 기존 블록 ID가 모두 남는지.

**2. Enter 순서 (P1-6·P1-8)** — 결정 3(우선순위 150 유지). `BlockExitOnEnter`의 Enter 처리 맨 앞에서 `SlashCommand`의 Suggestion 플러그인 상태(plugin key를 `SlashCommand.ts`에서 export)가 `active`면 `false`를 돌려 메뉴가 Enter를 받게 함. 테스트: 제목 줄 `/체크` + Enter로 블록이 들어가는지, 빈 코드 블록 Enter 탈출이 그대로인지. 슬래시 메뉴는 결과가 0개면 Enter·화살표에 `false`를 돌려 기본 동작으로 넘김.

**3. 제목 맨 앞 Enter (P1-7)** — 커서가 제목의 0번 위치면 위에 빈 문단을 넣고 제목은 그대로 둠(`insertContentAt($head.before(), paragraph)`). 끝·가운데는 지금처럼.

**4. 이미지 (P1-9)** — `allowBase64: false`. 붙여넣기·끌어 넣기 이미지는 `editorProps.handlePaste`/`handleDrop`에서 기존 장 이미지 업로드(`chapter-images`)로 올린 뒤 그 URL을 넣음. 올리기 전에는 넣지 않음(실패하면 알림).

**5. 툴바 상태 (P2-2)** — `useEditorState`로 툴바가 쓰는 `isActive` 값만 구독(`shouldRerenderOnTransaction: true`는 에디터 전체를 키마다 다시 그려 P2-5를 키움).

**6. 확인** — 확장 단위 테스트(Tiptap `Editor`를 jsdom에서 띄워 Enter·삽입 시나리오). 개발 서버에서 제목에서 `/체크` + Enter, 전체 선택 후 블록 삽입, 스크린샷 붙여넣기.

### 묶음 12-C 계획 — 에디터 성능·정리

- **P2-3** — `appendTransaction`에서 넣은 범위의 템플릿 노드가 ID가 그대로이고 문서 안에서 겹치지 않으면 정리를 건너뜀. 붙여넣기 규칙(새로 들어온 블록만 새 ID)이 그대로인지 기존 `TemplateNodeIds` 테스트가 지켜 줌.
- **P2-5** — 외부 동기화는 처음 내용이 들어올 때만(ref 플래그), 글자 수는 `onUpdate`에서 계산해 state로.
- **P2-8** — 장 전환 이펙트와 두 ref 삭제. `key`가 필요한 이유를 `EditPageContent.tsx:632`에 한 줄 주석으로.
- **P2-9** — `promptAndSetLink(editor)`, `positionPopup(popup, rect)`로 합침.
- 확인: 블록 30개짜리 장에서 입력 지연(개발 서버 Performance 탭), 기존 에디터 테스트.

### 묶음 12-D 계획 — 메타데이터 폼

**1. 서버 문구 (P1-11)** — `catch (e)`에서 `e instanceof Error && e.message`면 그 문구, 아니면 지금 문구. `handleMetaSave`가 던지는 문구가 서버의 한국어 안내인지 확인(영문 원문이면 그대로 내지 않게).

**2. 바뀐 필드만 (P1-12·P1-13)** — 처음 값과 다른 필드만 PUT. 소개 이미지가 없으면 `detail_image_alt`를 보내지 않음(지울 때는 이미지 삭제 라우트가 함께 비우는지 확인하고, 아니면 `null`을 한 번 보냄).

**3. 긴 글 (P1-10·P2-11)** — `maxLength`를 빼고 글자 수 표시(`textLength(trim)` / 상한)와 넘으면 칸 아래 안내, 저장 버튼 끄기. 이미 상한을 넘은 옛 글도 열자마자 같은 안내가 보임(P1-12의 원인을 화면에 드러냄).

**4. 최신 값 (P1-14)** — 서랍을 열 때 폼을 마운트하거나(`{metaOpen && <BookMetadataForm key={book.updated_at} …/>}`), 고치지 않은 필드는 `book`이 바뀌면 따라가게.

**5. 성공 표시 (P2-12)** — 서랍을 닫은 뒤 편집 화면에 "설정을 저장했어요" 알림. 타이머는 정리.

**6. 확인** — 폼 테스트(서버 400 문구 표시, 바뀐 필드만 전송, 숨긴 대체 글 미전송, 긴 옛 소개글 안내). 개발 서버에서 언어만 바꿔 저장.

## 결정이 필요한 것

1. **`class` 허용 범위 (P1-1, 12-A).** **2026-10-25 권장안으로 정함: `code`의 `language-[a-z0-9-]+`만 남기고 나머지 `class`는 지워요.** 운영 DB에 `class`가 든 장이 하나도 없어서(아래 SQL 결과가 빈 목록) 지워도 바뀌는 본문이 없어요. 정하기 전에 적은 내용: 에디터 확장이 내는 `class`는 없고(`RichTextEditor.tsx`의 확장 설정에 `class` 없음), 코드 블록 언어 표시(`language-*`)만 쓸 수 있어요. `code`의 `language-[a-z0-9-]+`만 남기고 나머지는 지우는 것을 권장해요. 먼저 운영 DB에서 `content_html LIKE '%class="%'`인 장 수와 쓰인 값을 봐서, 화면에 의미 있는 값이 있으면 목록에 더해요. 비교한 것:
   - 앱 Tailwind 유틸 중 위험한 것(`fixed`·`absolute`·`z-*`·`inset-*`)만 막기: 막을 목록이 Tailwind 버전마다 늘고, 하나만 빠져도 같은 오버레이가 돼요.
   - 리더 본문 컨테이너에 `contain: layout paint`나 `isolation`으로 가두기: 오버레이를 본문 안에 가둘 수는 있지만 본문 안 가짜 안내는 남아요. 보조로 함께 걸 수는 있어요.
2. **본문 이미지 주소 (P2-1, 12-A).** **2026-10-25 정함: 우리 Storage(`chapter-images`) 주소만 받아요.** 처리는 12-A 계획 4. 운영 DB 확인(2026-10-25): 외부 이미지가 든 장 0, `data:` 이미지가 든 장 0 — 지금 저장된 장에서 빠지는 이미지는 없으므로 편집 화면 경고(12-A 계획 4의 마지막 항목)는 하지 않아요. 정하기 전에 적은 내용: `img src`를 우리 Storage 공개 버킷(`chapter-images`) URL로만 좁히는 것을 권장해요 — 내보내기의 `loadStorageImage()`와 같은 기준이라 리더와 EPUB이 같아져요. 다만 업로드 원고(DOCX·Markdown)에 든 외부 이미지가 사라지므로, 업로드 파서가 외부 이미지를 내려받아 올리거나 대체 글로 남기는 처리를 함께 해야 해요. 먼저 운영 DB에서 외부 `src`를 쓰는 장 수를 봐요. 0이 아니면 그 장들은 다음 저장 때 이미지가 빠지므로, 저자에게 알릴지(편집 화면 경고) 정해요.
3. **슬래시 메뉴와 제목 Enter (P1-6, 12-B).** **2026-10-25 권장안으로 정함.** 처리는 12-B 계획 2. 정하기 전에 적은 내용: `BlockExitOnEnter`의 우선순위를 Suggestion보다 낮추는 대신, Enter 처리 맨 앞에서 슬래시 메뉴가 열려 있으면 `false`를 돌려주는 것을 권장해요. 150은 코드 블록(100)보다 먼저 받으려고 정한 값이라, 낮추면 코드 블록 탈출이 다시 깨질 수 있어요. 메뉴가 열려 있는지는 Suggestion 플러그인 상태(`SlashCommand`의 plugin key)로 봐요.

### 운영 DB에서 볼 것 (결정 1·2)

Supabase 대시보드 SQL Editor에서 실행해요. 본문을 읽지 않고 개수와 값만 봐요.

```sql
-- 결정 1: 장 본문에 쓰인 class 값과 장 수
SELECT m[1] AS class_value, count(DISTINCT c.id) AS chapters
FROM chapters c, regexp_matches(c.content_html, 'class="([^"]*)"', 'g') AS m
GROUP BY 1 ORDER BY 2 DESC;

-- 결정 2: 우리 chapter-images가 아닌 이미지가 든 장 수 (외부 / data:)
SELECT
  count(DISTINCT c.id) FILTER (WHERE m[1] LIKE 'data:%') AS data_uri_chapters,
  count(DISTINCT c.id) FILTER (WHERE m[1] NOT LIKE 'data:%'
    AND m[1] NOT LIKE '%/storage/v1/object/public/chapter-images/%') AS external_chapters
FROM chapters c, regexp_matches(c.content_html, '<img[^>]*\ssrc="([^"]*)"', 'g') AS m;
```
