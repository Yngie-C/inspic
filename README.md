# Inspic

**읽는 책이 아니라 적용하는 책 — 인터랙티브 워크북 출판 플랫폼**

크리에이터가 원고에 워크시트·체크리스트·성찰 질문을 끼워 넣어 출간하면, 독자는 읽으면서 직접 작성하고 그 결과를 계정에 남긴다.

> **현재 상태: MVP 재구성 중 (M4 완료)**
> 이 저장소는 2026-08-04부터 MVP 재정의 작업 중입니다. 범위 밖 기능을 삭제하고 핵심 루프 하나에 집중합니다.
> 재구성 이전 코드는 `pre-mvp-archive` 태그에 보존돼 있습니다.

---

## 핵심 루프

> 크리에이터가 워크북형 전자책을 출간한다
> → 독자가 구매해 읽으며 직접 작성한다
> → 작성 내용이 계정에 남고 내보낼 수 있다
> → 크리에이터가 참여 반응을 본다

이 루프의 심장은 **독자 응답 데이터**다. M1에서 스키마와 도메인 모델을 세웠고(`workbook_blocks` / `workbook_block_fields` / `workbook_responses`), M2에서 저작 측 쓰기 경로를, M3에서 독자 측 쓰기 경로를 붙였다. 이제 독자가 쓴 답은 계정에 남고, 다른 기기에서 이어서 쓸 수 있다. `localStorage`는 오프라인 캐시로 강등됐다 — 진실의 원천은 DB다.

M4에서 그 앞단인 **판매**를 닫았다. 결제 승인 뒤 어디서 끊겨도 구매가 생기거나 돈이 돌아간다. 구매 기록을 만들 수 있는 것은 승인을 확인한 서버뿐이고(클라이언트 INSERT 경로를 없앴다), 유료 책의 첫 챕터는 누구나 읽을 수 있다.

---

## 마일스톤

| | 내용 | 상태 |
|---|---|---|
| **M0** | 범위 밖 코드 삭제, 중복 라우트 통합, 문서 정합화 | **완료** |
| **M1** | 도메인 재설계 — 워크북 응답 스키마, 인증 트리거 이관, 테스트 도입 | **완료** |
| **M2** | 워크북 저작 — 블록 정의 동기화, 이미지 저장소, 공개 전 검수 | **완료** |
| **M3** | 워크북 독서 (독자 루프) — 응답이 DB에 저장, 리더 재작성 | **완료** |
| **M4** | 판매·접근 제어 — 결제 보상 트랜잭션, webhook, 첫 챕터 미리보기 | **완료** |
| **M5** | 응답 회수 — 내 워크북, 응답 포함 PDF, 크리에이터 참여 지표 | **완료** |
| **M6** | 실사용 검증 — 본인 콘텐츠 1권 + 저자 2~3명 | 예정 |

각 마일스톤은 "코드가 존재한다"가 아니라 **"사용자가 끝까지 통과한다"**로 완료를 판정한다.

---

## 현재 구현된 기능

- **인증**: Supabase Auth (이메일 + OAuth), Zustand `auth-store`. 프로필 행은 `auth.users` INSERT 트리거가 만듭니다
- **콘텐츠 생성**: 직접 작성 또는 파일 업로드 (txt / Markdown / DOCX)
- **에디터**: Tiptap 리치 텍스트 + 슬래시 커맨드, 본문 이미지는 Supabase Storage(`chapter-images`)에 업로드
- **워크북 템플릿 5종**: 체크리스트, 콜아웃, 리플렉션, SMART 목표, 1–10 스케일
- **리더**: 챕터 단위 읽기 + 워크북 작성. 답은 `workbook_responses`에 저장되고 다른 기기에서 이어집니다. 저장 상태를 화면에 표시합니다. 로그인 없이도 열리며, 답이 계정에 남지 않는 동안에는 화면이 그렇게 말합니다
- **판매**: Toss Payments 결제. 승인 → 구매 반영은 한 트랜잭션이고 멱등하며, 반영하지 못하면 결제를 자동 취소합니다. webhook이 창을 닫은 경우를 메웁니다
- **접근 제어**: 소유자 / 구매자 / 무료 공개 / **첫 챕터 미리보기** 네 갈래. 구매 기록은 서버만 만들 수 있습니다
- **내보내기**: PDF (`@react-pdf/renderer`), EPUB (자체 생성기)
- **탐색**: 검색, 언어/가격 필터, 정렬
- **크리에이터 스튜디오**: 내 작품 관리, 판매 현황, 기본 분석
- **공개 전 검수**: `/create/preview/[bookId]`에서 차단·경고 항목을 확인한 뒤 공개. 차단 항목은 서버(`PUT /api/books/[bookId]`)도 다시 검사합니다

## MVP 범위에서 제외된 것

M0에서 삭제했습니다. 되돌리려면 `pre-mvp-archive` 태그를 참조하세요.

TTS·오디오북 전체 · 죽은 리더 서브시스템(하이라이트/북마크/진행률/페이지네이션) · 시리즈 연재 시스템 · 알림 · 다국어(next-intl) · AI 보조(요약/교정/번역/커버) · 협업 저작 · 리뷰·팔로우 · 워크북 템플릿 7종(Toggle, N열, Before/After, 사분면, OKR, 습관 트래커, WOOP)

---

## 기술 스택

```
프레임워크      Next.js 16 (App Router)
언어           TypeScript 5.9
UI            React 19 + Tailwind CSS 4 + Radix UI
상태관리       Zustand 5
데이터 페칭    TanStack Query
백엔드         Supabase (Auth + PostgreSQL + Storage)
에디터         Tiptap 3
결제           Toss Payments
PDF/EPUB      @react-pdf/renderer, pdf-lib, 자체 EPUB 생성기
XSS 방지      DOMPurify (isomorphic-dompurify)
배포           Vercel
```

---

## 프로젝트 구조

```
src/
├── app/
│   ├── api/              # API 라우트 21개
│   │   ├── analytics/    #   분석 + 판매
│   │   ├── books/        #   책 CRUD, 접근 권한, 커버, 본문 이미지, 상세,
│   │   │                 #   공개 전 검수, 독자 응답
│   │   ├── chapters/     #   챕터 CRUD
│   │   ├── epub/ pdf/    #   내보내기
│   │   ├── explore/      #   탐색
│   │   ├── landing/      #   랜딩 데이터
│   │   ├── payments/     #   결제 요청/승인/webhook
│   │   ├── purchases/    #   구매 내역
│   │   └── upload/       #   파일 업로드
│   ├── auth/             # 로그인/회원가입/콜백
│   ├── book/[bookId]/    # 책 상세 (공개, 서버 컴포넌트 + 메타데이터)
│   ├── create/           # 생성 · 업로드 · 편집 · 미리보기 · 위저드
│   ├── creator/          # 크리에이터 스튜디오 (+ 분석)
│   ├── explore/          # 탐색
│   ├── my/               # 내 서재 · 구매 내역 · 설정
│   ├── payments/         # 결제 플로우
│   └── reader/[bookId]/  # 리더
├── components/
│   ├── editor/           # Tiptap 에디터 + 워크북 노드 5종
│   ├── reader/           # 본문 렌더러 + 응답 provider + 워크북 템플릿 5종
│   ├── landing/ explore/ dashboard/ analytics/ preview/ wizard/ upload/ layout/ ui/
├── lib/
│   ├── workbook/         # 워크북 도메인 — 블록 추출·동기화, 응답 검증·병합·
│   │                     # 복원, 오프라인 캐시, 타입
│   ├── publish-checks*   # 공개 전 검수 (순수 판정 + DB 로더)
│   ├── upload-parser.ts  # 원고 → 챕터 파싱 (txt/md/docx)
│   └── …                 # supabase, sanitize, access-control, epub, pdf, toss
├── stores/               # Zustand (auth)
└── types/                # 공통 타입

supabase/migrations/      # 00001 초기 스키마(M1 통합 리셋) + 00002 블록 동기화·이미지 버킷(M2)
                          # + 00003 결제 이행 RPC·구매 INSERT 봉인·첫 챕터 미리보기(M4)
```

### 워크북 데이터 모델

```
workbook_blocks          블록 정의. id = 에디터의 data-node-id (생성 시 1회 부여, 불변)
  └ workbook_block_fields  블록 안의 문항. (block_id, field_key) 유일

workbook_responses       독자 응답. (user_id, block_id, field_key) 유일
```

응답은 **오직 `(block_id, field_key)`로만** 정의와 만난다. 배열 인덱스나 순서는 정체성에 들어가지 않으므로, 크리에이터가 문항을 추가·삭제·이동해도 남은 응답은 제자리에 붙는다.

`workbook_responses.block_id`에는 FK가 없다. 크리에이터가 문항을 지웠다고 독자가 쓴 내용까지 지워지면 안 되기 때문이다. 정의가 사라진 응답은 `orphanedResponses()`로 따로 다룬다.

**`data-*` 속성에는 독자 응답을 담지 않는다.** 챕터 HTML은 문항만 싣고, 답은 전부 `workbook_responses`에 있다.

쓰기 경로는 방향마다 하나뿐이다.

```
저작:  챕터 저장 → syncChapterWorkbookBlocks() → sync_chapter_workbook_blocks RPC
독자:  리더 입력 → WorkbookResponsesProvider → PUT /api/books/[id]/responses
```

저작 측 RPC는 upsert와 삭제를 **한 트랜잭션**으로 처리하고, 응답 테이블은 건드리지 않는다.

독자 측은 리더가 `(block_id, field_key, 값)`만 보낸다. **어느 챕터인지, 어느 값 컬럼에 넣을지는 서버가 DB의 블록 정의에서 읽어 정한다.** 그래서 정의가 DB에 없는 블록에는 응답이 매달리지 않고, 남의 챕터 ID를 실어 보낼 수도 없다.

---

## 시작하기

### 사전 요구사항

- Node.js 18+ / npm
- Supabase 프로젝트 (Auth + PostgreSQL + Storage)
- Toss Payments 키 (결제 테스트용)

### 설치

```bash
npm install
cp .env.example .env.local   # 로컬 값 입력
npm run dev
```

Supabase 프로젝트에는 `supabase/migrations/`를 파일명 순서대로 적용합니다 (`supabase db push` 또는 SQL 에디터). `00002`는 블록 동기화 RPC와 `chapter-images` 버킷을, `00003`은 결제 이행 RPC와 첫 챕터 미리보기 정책을 만듭니다 — 적용하지 않으면 챕터 저장 시 블록 정의가 반영되지 않고, 본문 이미지 업로드와 결제 승인 반영이 실패합니다.

Toss webhook은 상점 관리자에서 `https://<도메인>/api/payments/webhook`을 등록하세요. 등록하지 않아도 결제는 되지만, 승인 직후 창을 닫은 경우를 메우지 못합니다.

[http://localhost:3000](http://localhost:3000)

### 검증

```bash
npm run typecheck   # 통과 (에러 0)
npm run build       # 통과
npm test            # 통과 (320개)
npm run lint        # 10개 에러 — 재구성 이전부터 존재하는 부채 (아래 참조)
```

---

## 알려진 부채

| 항목 | 위치 | 해소 시점 |
|---|---|---|
| 미리보기에서 쓴 답(익명 캐시)을 구매·로그인 후 옮겨 주지 않음 | `lib/workbook/response-cache.ts` | 미정 |
| EPUB 내보내기에는 응답이 담기지 않음 (빈 워크시트) | `api/epub` | 필요해지면 |
| 실제 Toss 테스트 결제로 4개 시나리오를 밟아 보지 않음 (DB·보상 로직은 테스트가 덮음) | — | 키 확보 시 |
| 페이지 대부분이 `"use client"` — 공개 콘텐츠 SEO 부재 | `app/**` | M6 이후 |
| React Compiler lint 에러 10개 (setState-in-effect, `any` 5개 등) | 아래 파일들 | 별도 정리 |

M1에서 해소됨: 응답의 배열 인덱스 매칭 · `data-node-id` 재생성 · 클라이언트 프로필 생성 이중 경로 · 테스트 0개 · SMART 블록의 `data-template-type` 불일치.

M5에서 해소됨: 크리에이터 미리보기 응답이 집계에 섞이던 것 · PDF에 한글이 깨져 나오던 것 · `/api/pdf`·`/api/epub`의 권한 판정이 구매를 보지 않던 것 · 두 라우트가 없는 `profiles` 테이블을 조회해 저자명이 늘 비어 있던 것.

M2에서 해소됨: 블록 정의가 DB에 반영되지 않던 것 · 본문 이미지 base64 인라인 · 업로드 파서가 라우트에 묶여 있던 것 · 출간해도 `visibility`가 `private`이라 아무에게도 보이지 않던 것.

M3에서 해소됨: 워크북 응답이 localStorage에만 있던 것(기기 간 유실, 크리에이터 조회 불가) · 리더의 하드코딩된 `fontSize`/`theme` · 로그인 후 원래 보던 화면으로 돌아오지 못하던 것.

M4에서 해소됨: **로그인 사용자가 자기 이름으로 `purchases` 행을 넣어 유료 책을 열 수 있던 것** · 승인 후 구매 기록 생성 실패 시 보상 없던 것 · 재확인(`ALREADY_PROCESSED_PAYMENT`)을 승인 실패로 보고 끝난 결제를 `aborted`로 덮던 것 · 창을 닫으면 결제가 유실되던 것(webhook 없음) · `UNIQUE(user_id, book_id)`가 재구매를 막던 것 · 응답 캐시가 사용자별로 나뉘지 않던 것 · `.env.example`의 Toss 클라이언트 키 이름이 코드와 달랐던 것.

React Compiler 에러 위치: `analytics/StatsCard`, `editor/SlashCommandMenu`, `editor/extensions/SlashCommand`(any 5개), `explore/SearchBar`, `preview/PreviewFrame`, `upload/FileDropzone`

---

## 보안

- **XSS 방지**: DOMPurify 이중 방어 (서버 저장 시 + 클라이언트 렌더링 시). 워크북 템플릿을 위해 `data-*` 속성과 `input[type=checkbox]`만 선별 허용
- **인증**: Supabase Auth + RLS. 미들웨어는 `getUser()`로 JWT를 서버 검증하며, 실패 시 미인증 처리 (검증 없는 `getSession()` 폴백 없음)
- **파일 업로드**: MIME 타입 검증, 크기 제한 (txt/md 5MB, docx 20MB)
- **결제**: 가격은 항상 서버에서 `books.price`를 읽어 결정하고, 반영할 금액은 Toss가 승인한 값을 씁니다. **구매 기록에는 INSERT 정책이 없습니다** — 승인을 확인한 서버가 `fulfill_payment()`로만 만듭니다. webhook은 본문을 믿지 않고 Toss에 다시 물어 확인합니다
- **독자 응답**: 작성자 본인만 읽고 씁니다. 크리에이터는 행을 볼 수 없고 `workbook_response_stats()` 집계 함수로만 조회합니다
- **RLS 검증**: 정책이 실제로 무엇을 막는지 임베디드 Postgres에서 롤을 갈아타며 테스트합니다 (`src/lib/supabase/__tests__/rls.test.ts`). 유료 콘텐츠 차단과 응답 격리가 여기서 고정됩니다

---

## 라이선스

Private
