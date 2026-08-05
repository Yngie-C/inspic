# AGENTS.md

이 파일은 Hermes Agent, Codex, Claude Code 및 기타 코딩 에이전트가 이 저장소에서 작업할 때 우선적으로 따라야 하는 프로젝트별 지침이자 source of truth입니다.

에이전트는 코드 변경 전에 이 파일을 읽고 따라야 합니다. 더 깊은 디렉터리에 별도의 `AGENTS.md`가 있으면 해당 하위 범위에서는 더 깊은 파일이 이 지침을 우선합니다.

판단이 애매할 때는 다음 원칙을 우선하세요.

- 사용자가 만든 변경사항을 보존하세요.
- 기존 프로젝트 패턴을 먼저 따르세요.
- 변경 diff를 작고 되돌리기 쉽게 유지하세요.
- 가능한 경우 lint, typecheck, build로 검증하세요.

## 프로젝트 개요

Inspic은 **인터랙티브 워크북 출판 플랫폼**입니다. "읽는 책"이 아니라 "적용하는 책"을 지향합니다.

크리에이터가 원고에 워크시트·체크리스트·성찰 질문을 끼워 넣어 출간하면, 독자는 읽으면서 직접 작성하고 그 결과를 자기 계정에 남깁니다.

**현재 상태: MVP 재구성 중.** 2026-08-04에 M0(범위 밖 코드 삭제)과 M1(도메인 재설계)을, 2026-08-05에 M2(워크북 저작)를 완료했습니다. 상세 계획과 마일스톤은 `README.md`, 진행 중인 작업은 `TODO.md`를 보세요.

핵심 기능:
- 텍스트/Markdown/DOCX 업로드 및 챕터 구조화
- Tiptap 기반 리치 텍스트 에디터 + 워크북 블록 5종
- 웹 전자책 리더
- Toss Payments 기반 유료 판매 + 구매 기반 접근 제어
- PDF/EPUB 내보내기
- Supabase Auth/DB/Storage 기반 백엔드

### MVP 범위에서 제외됨 (M0에서 삭제)

아래 기능은 저장소에 **없습니다**. 다시 추가하지 마세요. 필요하면 먼저 사용자와 범위를 합의하세요.

TTS·오디오북 · 하이라이트/북마크/독서진행률/리더설정 · 시리즈 연재 · 알림 · 다국어(next-intl) · AI 보조(요약/교정/번역/커버) · 협업 저작 · 리뷰·팔로우 · 워크북 템플릿 7종(Toggle, N열, Before/After, 사분면, OKR, 습관 트래커, WOOP)

삭제 이전 코드는 `pre-mvp-archive` 태그에 있습니다.

## 기술 스택

- Framework: Next.js 16 App Router
- Language: TypeScript 5.9
- UI: React 19
- Styling: Tailwind CSS 4
- State: Zustand 5
- Data Fetching: TanStack Query
- Backend: Supabase Auth, PostgreSQL, Storage
- Editor: Tiptap 3
- PDF/EPUB: @react-pdf/renderer, pdf-lib, 자체 EPUB 생성기
- Payments: Toss Payments
- Package manager: npm

## 주요 디렉터리

- `src/app/`: Next.js App Router 페이지와 API routes
- `src/components/`: UI 및 기능별 컴포넌트
  - `editor/extensions/templates/`: 워크북 블록의 Tiptap Node (저작 측)
  - `reader/templates/`: 워크북 블록의 리더 컴포넌트 (독자 측)
- `src/lib/`: Supabase, sanitize, access-control, PDF/EPUB, Toss 등 핵심 유틸리티
  - `workbook/`: 워크북 도메인 — 블록 정의 추출, 응답 병합·복원, 공유 타입
- `src/stores/`: Zustand stores
- `src/types/`: TypeScript 타입 정의
- `supabase/migrations/`: Supabase DB 마이그레이션. `00001_initial_schema.sql`(초기 스키마) + `00002_workbook_block_sync.sql`(블록 동기화 RPC, `chapter-images` 버킷)
- `content/`: 전자책 원고 및 콘텐츠 문서
- `creator-outreach/`: 크리에이터 아웃리치 관련 문서
- `.claude/`: Claude Code 커스텀 커맨드/프로젝트 메모
- `.omc/`, `.omx/`: 로컬 에이전트/작업 상태. 일반적으로 직접 수정하지 말 것

## 기본 명령어

개발 서버:

```bash
npm run dev
```

Lint:

```bash
npm run lint
```

Production build:

```bash
npm run build
```

TypeScript typecheck:

```bash
npm run typecheck
```

테스트 (Vitest):

```bash
npm test
```

## 작업 전 체크리스트

1. 현재 작업 트리 상태를 확인하세요.

```bash
git status --short
```

2. 사용자가 이미 수정한 파일을 덮어쓰지 마세요.
3. 기존 변경사항이 있으면 그 변경사항을 보존하는 방향으로 작업하세요.
4. 큰 변경 전에는 관련 파일과 README, 기존 구현 패턴을 먼저 확인하세요.
5. 큰 작업이나 맥락 확인이 필요한 작업은 아래 **에이전트 참고 지식 맵**을 먼저 확인하세요.

## 에이전트 참고 지식 맵

Hermes, Codex, Claude Code 및 기타 코딩 에이전트는 프로젝트 맥락이 필요할 때 아래 순서로 참고하세요. 모델 제공자가 GPT, Claude, Ollama-Cloud 기반 오픈소스 모델 중 무엇이든 프로젝트 지식의 source of truth는 저장소 문서입니다.

1. **우선 규칙**: `AGENTS.md`
   - 이 파일이 현재 프로젝트의 코딩 규칙, 보안 규칙, 검증 기준, Git 작업 규칙의 source of truth입니다.
2. **MVP 재구성 계획**: `docs/agent-knowledge/mvp-rebuild-plan.md`
   - 코드 감사 결과, 확정된 제품 결정, MVP 정의, M0~M6 마일스톤과 게이트가 들어 있습니다.
   - 진행 상황과 다음 작업 목록은 `TODO.md`, 마일스톤 요약은 `README.md`를 보세요.
   - **새 작업을 시작하기 전에 이 세 문서를 먼저 확인하세요.** 현재 마일스톤 범위 밖의 기능은 추가하지 않습니다.
3. **Canonical 장기 지식**: `docs/agent-knowledge/`
   - 새로 발견한 컨벤션, 아키텍처 결정, 반복 워크플로, Hermes/Ollama-Cloud/OMX 운영 지식은 기본적으로 이 디렉터리에 저장하세요.
   - `.claude/`, `.omc/`, `.omx/`에 흩어진 기존 지식 중 앞으로도 유효한 내용은 이 디렉터리에 요약해 승격하세요.
4. **Legacy 참고 자료**: `.claude/projects/`, `.claude/commands/`, `.omc/project-memory.json`, `.omc/plans/`, `.omc/specs/`
   - Claude Code / OMC에서 넘어온 과거 기획, deep interview, 프로젝트 메모, 콘텐츠 리뷰 커맨드 등은 읽기 전용 historical context로 활용하세요.
   - 새 장기 지식은 여기에 추가하지 말고 `docs/agent-knowledge/`에 추가하세요.
5. **OMX 런타임 및 임시 작업 지식**: `.omx/wiki/`, `.omx/project-memory.json`, `.omx/plans/`, `.omx/notepad.md`
   - 존재하는 경우 최신 작업 맥락, 계획, 위키, 노트를 참고할 수 있습니다.
   - 단, `.omx/`는 canonical 장기 지식 저장소가 아니라 런타임/스크래치 공간으로 취급하세요.
6. **수정 금지 기본값**
   - `.omc/`와 `.omx/`의 상태, 세션, 로그, 캐시 파일은 사용자가 명시적으로 요청하지 않는 한 수정하지 마세요.
   - 필요한 지식이 여러 곳에 흩어져 있으면, 임의로 상태 파일을 옮기거나 삭제하지 말고 `docs/agent-knowledge/`에 요약하세요.

## 워크북 데이터 모델 (가장 중요)

워크북은 이 제품의 핵심 베팅입니다. M1(2026-08-04)에서 아래 구조로 확정했습니다.

```
workbook_blocks            블록 정의. id = 에디터의 data-node-id
  └ workbook_block_fields    블록 안의 문항. (block_id, field_key) 유일

workbook_responses         독자 응답. (user_id, block_id, field_key) 유일
```

쓰기 경로는 방향마다 하나뿐입니다.

```
저작:  챕터 저장 → syncChapterWorkbookBlocks() → sync_chapter_workbook_blocks RPC
독자:  (M3에서 추가) useBlockAnswers → workbook_responses
```

도메인 코드는 `src/lib/workbook/`에 있습니다. 관련 코드를 만질 때 아래를 반드시 지키세요.

- **응답과 정의는 오직 `(block_id, field_key)`로만 만납니다.** 배열 인덱스나 길이로 매칭하지 마세요. 크리에이터가 문항을 하나만 추가/삭제해도 독자 응답이 전부 밀리거나 사라집니다. 복원은 `restoreBlockAnswers()`를 쓰세요.
- **`block_id`는 블록이 문서에 들어올 때 1회 부여하고 절대 재생성하지 마세요.** `parseHTML`에서 `|| generateNodeId()` 같은 폴백을 두면 속성이 유실될 때 키가 바뀌어 응답이 끊깁니다. 부여는 `BaseTemplateNode.ts`의 ProseMirror 플러그인이 담당합니다. ID가 없는 블록은 만들어 붙이지 말고 건너뛰세요.
- **`data-*` 속성에 독자 응답을 담지 마세요.** 챕터 HTML은 문항만 싣습니다. 체크 여부·스케일 선택값·SMART 답변은 전부 `workbook_responses`에 있습니다. 저작 화면에서 답변처럼 보이는 입력을 만들지 마세요.
- **문항은 `data-*` 안의 JSON이 아니라 `workbook_block_fields` 행으로 저장하세요.** 크리에이터 지표는 이 테이블을 조인해 냅니다.
- **`workbook_responses.block_id`에는 FK가 없습니다. 의도적입니다.** 크리에이터가 문항을 지워도 독자가 쓴 내용은 남아야 합니다. 정의가 사라진 응답은 `orphanedResponses()`로 분리해 다루세요. `book_id`/`chapter_id`에는 FK CASCADE가 있습니다 — 책·챕터 삭제는 소유자의 명시적 파기로 봅니다.
- **크리에이터에게 응답 원문을 보여주지 마세요.** RLS상 작성자 본인만 행을 읽습니다. 집계는 `workbook_response_stats()` 함수로만 조회합니다.
- **`localStorage`는 오프라인 캐시입니다.** 진실의 원천은 DB입니다. (M3에서 `useBlockAnswers` 훅 내부가 DB 호출로 교체됩니다. 호출부는 그대로 두세요.)
- **파싱된 노드에 `instanceof Element`를 쓰지 마세요.** `html-dom-parser`가 ESM 경로에서 자체 `domhandler` 사본을 끌어와 클래스 정체성이 어긋납니다. `lib/workbook/dom.ts`의 `isElementNode()`를 쓰세요.
- **블록 정의를 DB에 쓸 때는 `syncChapterWorkbookBlocks()`만 쓰세요.** `workbook_blocks` / `workbook_block_fields`에 직접 INSERT/UPDATE 하지 마세요. 실제 쓰기는 `sync_chapter_workbook_blocks` RPC가 upsert와 삭제를 **한 트랜잭션**으로 처리합니다(마이그레이션 00002). 여러 왕복으로 나누면 중간 실패 시 블록은 새 정의, 문항은 옛 정의로 남고 다음 저장 전까지 복구되지 않습니다.
- **동기화가 실패해도 챕터 저장을 실패시키지 마세요.** 본문은 이미 저장된 뒤라 여기서 던지면 크리에이터에게는 글이 날아간 것처럼 보입니다. 결과를 응답의 `workbook_sync`에 싣고, 공개 전 검수(`lib/publish-checks.ts`)가 본문과 DB가 어긋난 상태를 차단합니다.
- **`data-node-id`가 없는 블록에 ID를 만들어 붙이지 마세요.** `extractWorkbookBlocks()`는 그런 블록을 건너뜁니다. 세어야 할 때는 `countWorkbookBlockElements()`를 쓰세요 — 두 수의 차이가 곧 "화면에는 보이지만 응답을 받을 수 없는 블록"이고, 검수가 그것을 차단 사유로 씁니다.
- 워크북 블록을 추가/변경하면 에디터 Node, 리더 컴포넌트, `lib/sanitize.ts` 허용 목록, `lib/template-fallback.ts`(EPUB/PDF 정적 폴백), `lib/workbook/extract-blocks.ts`의 `BLOCK_TYPE_BY_TEMPLATE` 표, `00001` 스키마의 `block_type` CHECK 제약을 **함께** 확인하세요. `data-template-type` 문자열은 앞의 네 곳이 공유합니다.

## 출간 경로

크리에이터가 책을 공개하는 경로는 하나입니다.

```
편집 화면 "검수 후 공개"  →  /create/preview/[bookId]  →  공개하기
                              (검수 패널)                (PUT /api/books/[bookId])
```

- **판정 로직을 두 벌 만들지 마세요.** 화면과 API가 모두 `loadPublishChecks()`를 씁니다. 갈라지면 "미리보기는 통과했는데 출간은 막히는" 상태가 됩니다.
- **차단(blocker)은 조용한 실패에만 씁니다.** 크리에이터가 자기 화면에서 확인할 수 없는 것 — 응답을 받을 수 없는 블록, DB에 저장되지 않은 블록 — 만 막습니다. 표지·소개글 같은 완성도 항목은 경고입니다.
- **공개는 `status`와 `visibility`를 함께 바꿔야 합니다.** `status: published`만 보내면 `visibility`가 `private`으로 남아 아무에게도 보이지 않습니다.
- `published_at`은 서버가 찍습니다. 비어 있을 때만 채워서, 내렸다 다시 올려도 최초 출간일이 밀리지 않게 합니다.

## 코딩 규칙

- TypeScript를 엄격하게 사용하세요.
- 새 API route는 입력 검증, 에러 처리, 인증/권한 확인을 포함하세요.
- Supabase 쿼리는 RLS 정책을 고려해서 작성하세요.
- 사용자 입력 HTML/Markdown은 렌더링 전 sanitize 처리를 유지하세요.
- 클라이언트 컴포넌트와 서버 컴포넌트 경계를 명확히 하세요.
- 브라우저 API, localStorage, window, document 사용이 필요하면 Client Component에서만 사용하세요.
- 기존 UI 스타일과 Tailwind 유틸리티 패턴을 따르세요.
- 사용자 노출 문구는 한국어로 직접 씁니다. 다국어(next-intl)는 M0에서 삭제했습니다.
- 새 타입은 기존 `src/types/` 구조와 가까운 위치에 두세요. 워크북 관련 타입은 `src/lib/workbook/types.ts`에 있습니다.
- 중복 로직은 `src/lib/` 또는 커스텀 hook으로 분리하세요.

## 보안 및 데이터 주의사항

- `.env.local` 및 실제 secret 값을 읽거나 출력하거나 커밋하지 마세요.
- `.env*` 파일은 gitignore 대상입니다. 예시가 필요하면 실제 값 없는 `.env.example`만 작성하세요.
- `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, 결제 관련 secret은 서버 전용으로만 사용하세요.
- 클라이언트에 노출 가능한 값은 `NEXT_PUBLIC_` 접두사가 있는 값으로 제한하세요.
- 파일 업로드, HTML 렌더링, EPUB/PDF 생성 경로에서는 XSS와 악성 파일 입력을 고려하세요.
- DB schema 변경 시 migration 파일을 추가하고, 기존 migration을 수정하는 방식은 피하세요.

## Supabase 지침

- DB 변경은 `supabase/migrations/`에 새 migration으로 추가하세요.
- 기존 migration은 이미 적용되었을 수 있으므로 수정하지 마세요. M1의 통합 리셋은 보존할 실사용 데이터가 없다고 확정한 뒤 한 번만 한 예외입니다. 다시 하지 마세요.
- 스키마를 바꾸면 `src/lib/supabase/__tests__/`의 테스트도 함께 갱신하세요. 하네스가 `supabase/migrations/`의 모든 파일을 파일명 순서대로 적용하므로, 새 마이그레이션은 파일만 추가하면 테스트에 자동으로 들어옵니다. `schema.test.ts`가 구조·제약·트리거를, `rls.test.ts`가 `SET ROLE`로 정책을, `workbook-sync.test.ts`가 블록 동기화 RPC를 확인합니다.
- 하네스의 `auth` / `storage` 스키마는 Supabase가 미리 만들어 두는 것의 **스텁**입니다. 마이그레이션이 storage를 건드리면 스텁도 함께 늘리세요.
- **RLS 정책을 추가하거나 고치면 반드시 `rls.test.ts`에 통과 케이스와 차단 케이스를 함께 넣으세요.** RLS 버그는 조용히 새는 종류라 테스트 없이는 드러나지 않습니다.
- RLS 테스트를 쓸 때는 반드시 `asUser` / `asAnon` 헬퍼를 거치세요. 기본 연결은 테이블 소유자라 RLS를 통째로 우회하고, 그 상태로 쓴 테스트는 아무것도 검증하지 않으면서 초록불만 냅니다.
- 새 테이블에는 RLS 활성화와 필요한 policy를 포함하세요.
- 사용자별 데이터는 `auth.uid()` 기준 접근 제어를 명확히 하세요.
- Storage path 설계 시 사용자 ID/책 ID/챕터 ID 등 충돌 방지 키를 사용하세요.
- Edge Function 변경 시 환경변수와 호출 권한을 함께 점검하세요.

## 콘텐츠 문서 작업 지침

- `content/`의 전자책 원고는 독자 친화적인 한국어 구어체를 유지하세요.
- 기존 문체인 `~이에요`, `~해요` 톤을 우선 유지하세요.
- Claude Code, Hermes, npm, Next.js 등 도구 설명은 가능하면 최신 명령어와 대조하세요.
- 챕터 간 참조, 파일명, 커맨드 이름, 예시 경로가 실제 파일과 일치하는지 확인하세요.
- 콘텐츠 리뷰 작업은 `.claude/commands/review-content.md`의 관점을 참고할 수 있습니다.

## 검증 기준

코드 변경 후 가능한 범위에서 아래를 실행하세요.

```bash
npm run lint
npm run build
```

Typecheck과 테스트를 함께 실행하세요.

```bash
npm run typecheck
npm test
```

`npm run lint`는 현재 에러 11개가 남아 있습니다. 전부 재구성 이전부터 있던 React Compiler 부채이니, 새로 늘리지만 않으면 됩니다.

검증을 실행하지 못했다면, 최종 응답에 그 이유와 사용자가 직접 실행할 명령어를 명시하세요.

## Git 및 변경 관리

- 사용자가 요청하지 않는 한 commit, push, merge, rebase를 수행하지 마세요.
- 사용자가 만든 변경사항을 되돌리지 마세요.
- 생성/수정/삭제한 파일을 최종 응답에 요약하세요.
- 대규모 리팩터링보다 요청 범위에 맞춘 작고 검증 가능한 변경을 선호하세요.

## Hermes 사용 팁

- 프로젝트 작업 시작 시 `AGENTS.md`를 우선 확인하세요.
- 복잡한 작업은 todo로 나눠 진행하세요.
- 구현 전 필요한 파일을 먼저 읽고, 추측으로 코드를 작성하지 마세요.
- 반복 가능한 절차나 프로젝트 특화 워크플로가 생기면 skill로 저장할지 사용자에게 제안하세요.
- 코드 변경 전후로 `git status --short`를 확인해 의도치 않은 변경을 줄이세요.
