# 5단계 리뷰 결과 — 보안 입력 경계

- 날짜: 2026-10-03
- 실행 (경로마다 따로, 워크트리 `orca/workspaces/inspic/code-review`, 브랜치 `Yngie-C/code-review`):
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
- 대상 커밋: `6d5c76b` (열 경로 모두 `main`과 diff가 없어 파일 전체를 검토)
- 원 지적 35건(sanitize 4 · HtmlContentRenderer 0 · upload 5 · upload-parser 8 · cover 3 · images 7 · safe-redirect 1 · auth 1 · supabase 3 · middleware 3). 같은 원인을 합쳐 **28건 (P0 3 · P1 13 · P2 12)**.
  - `auth`의 1건은 `safe-redirect`와, `middleware.ts`의 3건은 `src/lib/supabase`와 같은 지적이에요.
  - Supabase 영문 오류 원문 노출(cover·images·upload)은 P1-9 하나로 합쳤어요.
- **검증 상태**
  - 직접 대조함: P0-2(라우트 `apiSuccess({ book, chapters })` ↔ `create/upload/page.tsx:67` `json.data.id`), P0-3(`src/app/author` 존재 + `startsWith("/auth")`), P1-4·P1-5·P1-10(`sanitize.ts` 허용 목록 + `RichTextEditor.tsx:7-65`의 Underline·Highlight·TextAlign·링크 `target: "_blank"`).
  - 리뷰어가 node로 확인: P0-1(`/\evil.com`, `/%09/evil.com`이 `https://evil.com/`으로 해석), P1-1·P1-2(장 경계 정규식).
  - 나머지는 코드를 따라가며 판단한 것이에요. 이 워크트리에 `node_modules`가 없어 테스트·앱 확인은 하지 않았어요.

계획은 [code-review-plan.md](../code-review-plan.md), 이전 결과는 [04-block-sync-publish.md](04-block-sync-publish.md)를 보세요.

## P0

| # | 위치 | 지적 |
|---|---|---|
| P0-1 | `src/lib/safe-redirect.ts:13` (호출: `auth/login/LoginForm.tsx:33`) | **오픈 리다이렉트 우회.** 문자 그대로 `//`로 시작하는 값만 거릅니다. `?redirect=/%5Cevil.com`(`/\evil.com`)이나 `/%09/evil.com`은 통과하고, 브라우저가 `\`→`/`, 탭 제거로 읽어 로그인 직후 `router.push`가 외부로 보냅니다. `\`·제어 문자 거절 또는 `new URL(raw, origin)` 후 origin 비교. `/auth/callback`은 `${origin}${next}`라 안전. |
| P0-2 | `src/app/api/upload/route.ts:132` ↔ `src/app/create/upload/page.tsx:67` | **업로드 성공 후 편집 화면으로 못 감.** 라우트는 `{ book, chapters }`, 화면은 `json.data.id`를 읽어 `bookId`가 `undefined`. "편집하기"가 안 떠서 다시 올리면 책이 중복 생성됩니다. 장 미리보기가 읽는 `preview` 필드도 행에 없음. |
| P0-3 | `src/lib/supabase/middleware.ts:68` | **로그인한 사용자가 작가 페이지에 못 들어감.** `startsWith("/auth")`가 `/author/[userId]`에도 걸려 항상 `/creator`로 보냅니다. `=== "/auth" \|\| startsWith("/auth/")`. 보호 경로 `/my`도 같은 방식(지금은 걸리는 라우트 없음). |

## P1

| # | 위치 | 지적 |
|---|---|---|
| P1-1 | `src/lib/upload-parser.ts:54` | `# 제1장 …`처럼 제목에 "제N장"/"Chapter N"이 있으면 `<h1>`과 "제1장"에 두 번 걸려 진짜 장마다 앞에 빈 장 "Chapter N"이 생김. |
| P1-2 | `upload-parser.ts:54` | "제N장"이 문장 중간(`앞의 제2장에서…`)에서도 걸려 문단 한가운데서 장이 잘림. |
| P1-3 | `upload-parser.ts:54` | `<h2>`도 장 경계 → `##` 절마다 장이 생김. |
| P1-4 | `src/lib/sanitize.ts:3` | `u`·`s`·`mark`가 허용 목록에 없어 밑줄·취소선·형광펜이 저장 시 사라짐(장 저장 `api/chapters/[chapterId]/route.ts:117`). |
| P1-5 | `sanitize.ts:11` | TextAlign의 `style="text-align: …"`가 지워져 정렬이 사라짐. `style` 통째 허용은 피하고 `text-align`만 통과시키는 훅으로. |
| P1-6 | `src/app/api/upload/route.ts:53`, `:112` | 파일은 5MB/20MB까지 받지만 `chapters.content_html`은 50만 자 CHECK(00001). 장 구분 없는 긴 원고·이미지 든 docx(mammoth base64)가 500 + Postgres 영문 메시지. 장별 길이를 미리 재서 한국어 400. |
| P1-7 | `src/app/api/books/[bookId]/cover/route.ts:60`, `:129` | POST·DELETE 모두 Storage 파일을 먼저 지우고 `books` UPDATE. UPDATE·업로드가 실패하면 DB가 404 파일을 가리켜 표지가 깨짐. 이전 파일 삭제를 UPDATE 성공 뒤로. |
| P1-8 | `src/lib/supabase/middleware.ts:58`, `:69-71` | 리디렉트 두 곳이 새 `NextResponse.redirect`를 돌려줘 `getUser()`가 갱신한 쿠키(`supabaseResponse`)가 버려짐 → 회전된 옛 refresh token이 남아 예기치 않은 로그아웃. 쿠키를 리디렉트 응답에 옮겨 담기. |
| P1-9 | `cover/route.ts:83`, `:102` · `images/route.ts:99` · `upload/route.ts`(DB 오류) | Supabase 오류 원문(`uploadError.message` 등)이 응답 `error`에 실려 화면에 그대로 보임. 원문은 서버 로그로, 화면엔 한국어. |
| P1-10 | `sanitize.ts:11` | `target`·`rel`이 지워져 리더의 외부 링크가 같은 탭에서 열림. `target`을 허용하면 `rel="noopener noreferrer"`를 강제로. |
| P1-11 | `upload-parser.ts:76` | 장 제목의 HTML 엔티티를 풀지 않음 → `Q&amp;A`, `Don&#39;t`가 그대로 저장·표시. |
| P1-12 | `upload-parser.ts:116` | 문단 분리 `/\n\n+/`가 CRLF를 못 받음 → Windows `.txt`는 원고 전체가 문단 하나. |
| P1-13 | `upload-parser.ts:118` | `.txt`를 escape 없이 HTML에 넣음 → `<중요>`, `a < b`가 sanitize로 사라지고, 본문의 `<h1>` 글자가 장을 자름. |

## P2

| # | 위치 | 지적 |
|---|---|---|
| P2-1 | `sanitize.ts:23` | `input` 제거 훅이 공유 DOMPurify 인스턴스에 import 시 등록 → 앱의 모든 sanitize 호출에 걸림(지금 호출자는 이 파일뿐). |
| P2-2 | `upload/route.ts:65` | 빈 `description`이 NULL 대신 `""`, `language`도 `""`로 저장되고 `BOOK_LANGUAGES` 검사 없음. |
| P2-3 | `upload/route.ts:62-64` | 폼 필드가 파일 파트로 오면 `.trim()`이 던져 500. 파일명이 `.md`뿐이면 빈 제목 책. |
| P2-4 | `upload/route.ts:127-130` | `syncChapterWorkbookBlocks()` 결과를 버리고 `workbook_sync`를 싣지 않음(AGENTS.md 규칙). |
| P2-5 | `upload-parser.ts:134` | 장 구분 없는 docx만 `content_raw`가 빔 — 여러 장 docx와 불일치. |
| P2-6 | `upload-parser.ts:66` | MIME이 확장자보다 먼저 → `.md`가 `text/plain`으로 오면 마크다운이 글자 그대로. |
| P2-7 | `images/route.ts:34-87` | 검증 오류 문구가 전부 영어, 에디터가 그대로 띄움(클라이언트 한국어 폴백이 안 나옴). |
| P2-8 | `images/route.ts:45`, `:80` | 책·장 조회 오류를 404로 돌려줌(5xx여야 함). |
| P2-9 | `images/route.ts:49-50` | 5MB 검사 전에 `formData()`로 본문 전체를 메모리에 읽음. |
| P2-10 | `images/route.ts:60` | 클라이언트가 보낸 `file.type`만 믿고 매직 바이트를 보지 않음. |
| P2-11 | `images/route.ts:14-16`, `:78-79` | 주석과 달리 장·책 삭제 시 `chapter-images/{bookId}/{chapterId}/`를 지우는 코드가 없음 → 유료 책 이미지도 공개 URL로 계속 열림. |
| P2-12 | `supabase/middleware.ts:57` | 로그인 후 돌아갈 주소에 쿼리가 빠짐. `pathname + search`(P0-1을 먼저 고친 뒤). |

## 참고 (지적으로 올리지 않음)

- `HtmlContentRenderer.tsx`: 발견 0건. 템플릿 조회는 `Map`, 요소 판정은 `isElementNode()`, 렌더 전 `sanitizeForRender`. 허용 목록에 `textarea`·checkbox `input`이 있어 템플릿 밖에 있으면 저장되지 않는 입력란이 그려질 수 있으나 Tiptap 정상 경로로는 못 만듦.
- `covers` 버킷의 Storage 정책은 마이그레이션에 없음(대시보드 설정으로 보임) → 남의 표지 파일 삭제 가능 여부는 판단 못 함. 고칠 때 대시보드 정책 확인.
- `server.ts`·`client.ts`·`admin.ts`·테스트 하네스는 문제 없음.

## 수정 묶음 제안

| 묶음 | 지적 | 비고 |
|---|---|---|
| A. 인증 경로 | P0-1, P0-3, P1-8, P2-12 | **수정함 (2026-10-03, 브랜치 `Yngie-C/fix-auth-redirect`).** `safeInternalPath`가 `new URL()`로 해석해 origin을 비교하고 해석한 경로를 돌려줌, 미들웨어는 경로 단위 비교(`matchesRoute`)·리디렉트에 세션 쿠키 옮겨 담기·돌아갈 주소에 쿼리 포함. 테스트 `safe-redirect.test.ts`, `supabase/middleware.test.ts` |
| B. 업로드 | P0-2, P1-1~3, P1-6, P1-11~13, P2-2~6 | 라우트·파서·업로드 화면이 얽혀 한 단위로. 실제 원고 샘플(md·txt CRLF·docx)로 테스트 |
| C. sanitize 서식 | P1-4, P1-5, P1-10, P2-1 | `lib/template-fallback.ts`·PDF 렌더에서 `u`/`s`/`mark`·정렬이 어떻게 찍히는지 함께 확인 |
| D. Storage 라우트 | P1-7, P1-9, P2-7~11 | cover·images. `covers` 버킷 정책 확인 포함 |
