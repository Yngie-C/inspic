# Inspic

**읽는 책이 아니라 적용하는 책 — 인터랙티브 워크북 출판 플랫폼**

크리에이터가 원고에 워크시트·체크리스트·성찰 질문을 끼워 넣어 출간하면, 독자는 읽으면서 직접 작성하고 그 결과를 계정에 남긴다.

> **현재 상태: MVP 재구성 중 (M1 완료)**
> 이 저장소는 2026-08-04부터 MVP 재정의 작업 중입니다. 범위 밖 기능을 삭제하고 핵심 루프 하나에 집중합니다.
> 재구성 이전 코드는 `pre-mvp-archive` 태그에 보존돼 있습니다.

---

## 핵심 루프

> 크리에이터가 워크북형 전자책을 출간한다
> → 독자가 구매해 읽으며 직접 작성한다
> → 작성 내용이 계정에 남고 내보낼 수 있다
> → 크리에이터가 참여 반응을 본다

이 루프의 심장은 **독자 응답 데이터**다. M1에서 스키마와 도메인 모델을 세웠고(`workbook_blocks` / `workbook_block_fields` / `workbook_responses`), 실제 DB 읽기·쓰기는 M2~M3에서 붙인다. 그때까지 응답은 `localStorage`에 머문다 — 다만 식별 구조는 이미 DB와 같다.

---

## 마일스톤

| | 내용 | 상태 |
|---|---|---|
| **M0** | 범위 밖 코드 삭제, 중복 라우트 통합, 문서 정합화 | **완료** |
| **M1** | 도메인 재설계 — 워크북 응답 스키마, 인증 트리거 이관, 테스트 도입 | **완료** |
| **M2** | 워크북 저작 (크리에이터 루프) | 예정 |
| **M3** | 워크북 독서 (독자 루프) — 여기서 처음으로 제품이 존재 | 예정 |
| **M4** | 판매·접근 제어 — 결제 보상 트랜잭션, webhook | 예정 |
| **M5** | 응답 회수 — 내 워크북, 내보내기, 크리에이터 지표 | 예정 |
| **M6** | 실사용 검증 — 본인 콘텐츠 1권 + 저자 2~3명 | 예정 |

각 마일스톤은 "코드가 존재한다"가 아니라 **"사용자가 끝까지 통과한다"**로 완료를 판정한다.

---

## 현재 구현된 기능

- **인증**: Supabase Auth (이메일 + OAuth), Zustand `auth-store`. 프로필 행은 `auth.users` INSERT 트리거가 만듭니다
- **콘텐츠 생성**: 직접 작성 또는 파일 업로드 (txt / Markdown / DOCX)
- **에디터**: Tiptap 리치 텍스트 + 슬래시 커맨드
- **워크북 템플릿 5종**: 체크리스트, 콜아웃, 리플렉션, SMART 목표, 1–10 스케일
- **리더**: 챕터 단위 읽기 (M3에서 재작성 예정)
- **판매**: Toss Payments 결제, 구매 기반 접근 제어
- **내보내기**: PDF (`@react-pdf/renderer`), EPUB (자체 생성기)
- **탐색**: 검색, 언어/가격 필터, 정렬
- **크리에이터 스튜디오**: 내 작품 관리, 판매 현황, 기본 분석

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
│   ├── api/              # API 라우트 17개
│   │   ├── analytics/    #   분석 + 판매
│   │   ├── books/        #   책 CRUD, 접근 권한, 커버, 상세
│   │   ├── chapters/     #   챕터 CRUD
│   │   ├── epub/ pdf/    #   내보내기
│   │   ├── explore/      #   탐색
│   │   ├── landing/      #   랜딩 데이터
│   │   ├── payments/     #   결제 요청/승인
│   │   ├── purchases/    #   구매 내역
│   │   └── upload/       #   파일 업로드
│   ├── auth/             # 로그인/회원가입/콜백
│   ├── book/[bookId]/    # 책 상세 (공개, 서버 컴포넌트 + 메타데이터)
│   ├── create/           # 생성 · 업로드 · 편집 · 미리보기 · 위저드
│   ├── creator/          # 크리에이터 스튜디오 (+ 분석)
│   ├── explore/          # 탐색
│   ├── my/               # 내 서재 · 구매 내역 · 설정
│   ├── payments/         # 결제 플로우
│   └── reader/[bookId]/  # 리더 (M3에서 재작성)
├── components/
│   ├── editor/           # Tiptap 에디터 + 워크북 노드 5종
│   ├── reader/           # HtmlContentRenderer + 워크북 리더 템플릿 5종
│   ├── landing/ explore/ dashboard/ analytics/ preview/ wizard/ upload/ layout/ ui/
├── lib/
│   ├── workbook/         # 워크북 도메인 — 블록 추출, 응답 병합·복원, 타입
│   └── …                 # supabase, sanitize, access-control, epub, pdf, toss
├── stores/               # Zustand (auth)
└── types/                # 공통 타입

supabase/migrations/      # 00001_initial_schema.sql (M1 통합 리셋)
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

[http://localhost:3000](http://localhost:3000)

### 검증

```bash
npm run typecheck   # 통과 (에러 0)
npm run build       # 통과
npm test            # 통과 (119개)
npm run lint        # 11개 에러 — 재구성 이전부터 존재하는 부채 (아래 참조)
```

---

## 알려진 부채

| 항목 | 위치 | 해소 시점 |
|---|---|---|
| 워크북 응답이 아직 localStorage에 있음 (기기 간 유실, 크리에이터 조회 불가). 스키마와 도메인 모델은 M1에서 완성 | `lib/template-storage.ts`, `reader/templates/useBlockAnswers.ts` | M3 |
| 챕터 저장 시 블록 정의를 DB에 반영하는 경로가 아직 없음 (`extractWorkbookBlocks()`는 준비됨) | `api/chapters/**` | M2 |
| 결제 승인 후 `purchases` INSERT 실패 시 보상 트랜잭션 없음, webhook 없음 | `api/payments/confirm/route.ts` | M4 |
| 페이지 대부분이 `"use client"` — 공개 콘텐츠 SEO 부재 | `app/**` | M3 이후 |
| React Compiler lint 에러 11개 (setState-in-effect, `any` 5개 등) | 아래 파일들 | 별도 정리 |

M1에서 해소됨: 응답의 배열 인덱스 매칭 · `data-node-id` 재생성 · 클라이언트 프로필 생성 이중 경로 · 테스트 0개 · SMART 블록의 `data-template-type` 불일치.

React Compiler 에러 위치: `analytics/StatsCard`, `editor/SlashCommandMenu`, `editor/RichTextEditor`, `editor/extensions/SlashCommand`(any 5개), `explore/SearchBar`, `preview/PreviewFrame`, `upload/FileDropzone`

---

## 보안

- **XSS 방지**: DOMPurify 이중 방어 (서버 저장 시 + 클라이언트 렌더링 시). 워크북 템플릿을 위해 `data-*` 속성과 `input[type=checkbox]`만 선별 허용
- **인증**: Supabase Auth + RLS. 미들웨어는 `getUser()`로 JWT를 서버 검증하며, 실패 시 미인증 처리 (검증 없는 `getSession()` 폴백 없음)
- **파일 업로드**: MIME 타입 검증, 크기 제한 (txt/md 5MB, docx 20MB)
- **결제**: 가격은 항상 서버에서 `books.price`를 읽어 결정 (클라이언트 금액 신뢰 안 함)
- **독자 응답**: 작성자 본인만 읽고 씁니다. 크리에이터는 행을 볼 수 없고 `workbook_response_stats()` 집계 함수로만 조회합니다
- **RLS 검증**: 정책이 실제로 무엇을 막는지 임베디드 Postgres에서 롤을 갈아타며 테스트합니다 (`src/lib/supabase/__tests__/rls.test.ts`). 유료 콘텐츠 차단과 응답 격리가 여기서 고정됩니다

---

## 라이선스

Private
