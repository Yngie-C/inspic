# Inspic

**읽는 책이 아니라 적용하는 책 — 인터랙티브 워크북 출판 플랫폼**

크리에이터가 원고에 워크시트·체크리스트·성찰 질문을 끼워 넣어 출간하면, 독자는 읽으면서 직접 작성하고 그 결과를 계정에 남긴다.

> **현재 상태: MVP 재구성 중 (M0 완료)**
> 이 저장소는 2026-08-04부터 MVP 재정의 작업 중입니다. 범위 밖 기능을 삭제하고 핵심 루프 하나에 집중합니다.
> 재구성 이전 코드는 `pre-mvp-archive` 태그에 보존돼 있습니다.

---

## 핵심 루프

> 크리에이터가 워크북형 전자책을 출간한다
> → 독자가 구매해 읽으며 직접 작성한다
> → 작성 내용이 계정에 남고 내보낼 수 있다
> → 크리에이터가 참여 반응을 본다

이 루프의 심장은 **독자 응답 데이터**다. 현재 응답은 `localStorage`에만 저장되며, DB 기반 저장은 M1~M3에서 구현한다.

---

## 마일스톤

| | 내용 | 상태 |
|---|---|---|
| **M0** | 범위 밖 코드 삭제, 중복 라우트 통합, 문서 정합화 | **완료** |
| **M1** | 도메인 재설계 — 워크북 응답 스키마, 인증 트리거 이관 | 예정 |
| **M2** | 워크북 저작 (크리에이터 루프) | 예정 |
| **M3** | 워크북 독서 (독자 루프) — 여기서 처음으로 제품이 존재 | 예정 |
| **M4** | 판매·접근 제어 — 결제 보상 트랜잭션, webhook | 예정 |
| **M5** | 응답 회수 — 내 워크북, 내보내기, 크리에이터 지표 | 예정 |
| **M6** | 실사용 검증 — 본인 콘텐츠 1권 + 저자 2~3명 | 예정 |

각 마일스톤은 "코드가 존재한다"가 아니라 **"사용자가 끝까지 통과한다"**로 완료를 판정한다.

---

## 현재 구현된 기능

- **인증**: Supabase Auth (이메일 + OAuth), Zustand `auth-store`
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
├── lib/                  # supabase, sanitize, access-control, epub, pdf, toss
├── stores/               # Zustand (auth)
└── types/                # 공통 타입

supabase/migrations/      # M1에서 재설계 예정
```

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
npm run lint        # 13개 에러 — 재구성 이전부터 존재하는 부채 (아래 참조)
```

---

## 알려진 부채

M0 시점에 남아 있는 것으로, 재구성 이전부터 존재했습니다.

| 항목 | 위치 | 해소 시점 |
|---|---|---|
| 워크북 응답이 localStorage 전용 (기기 간 유실, 크리에이터 조회 불가, 서버 내보내기 불가) | `lib/template-storage.ts` | M1–M3 |
| 응답을 배열 인덱스·길이로 매칭 — 문항 추가/삭제 시 응답 전량 폐기 | `reader/templates/*Reader.tsx` | M1–M3 |
| `data-node-id` 부재 시 파싱마다 새 UUID 생성 — 키 불안정 | `editor/extensions/templates/BaseTemplateNode.ts` | M1 |
| 결제 승인 후 `purchases` INSERT 실패 시 보상 트랜잭션 없음, webhook 없음 | `api/payments/confirm/route.ts` | M4 |
| `user_profiles` 생성이 클라이언트 두 경로에 중복 (DB 트리거로 이관 필요) | `stores/auth-store.ts` | M1 |
| 페이지 대부분이 `"use client"` — 공개 콘텐츠 SEO 부재 | `app/**` | M3 이후 |
| React Compiler lint 에러 13개 (setState-in-effect 등) | 아래 파일들 | 별도 정리 |
| 테스트 0개 | — | M1부터 도입 |

React Compiler 에러 위치: `analytics/StatsCard`, `editor/SlashCommandMenu`, `editor/RichTextEditor`, `editor/extensions/SlashCommand`(any 5개), `explore/SearchBar`, `preview/PreviewFrame`, `reader/templates/{Scale,SmartGoal}Reader`, `upload/FileDropzone`

---

## 보안

- **XSS 방지**: DOMPurify 이중 방어 (서버 저장 시 + 클라이언트 렌더링 시). 워크북 템플릿을 위해 `data-*` 속성과 `input[type=checkbox]`만 선별 허용
- **인증**: Supabase Auth + RLS. 미들웨어는 `getUser()`로 JWT를 서버 검증하며, 실패 시 미인증 처리 (검증 없는 `getSession()` 폴백 없음)
- **파일 업로드**: MIME 타입 검증, 크기 제한 (txt/md 5MB, docx 20MB)
- **결제**: 가격은 항상 서버에서 `books.price`를 읽어 결정 (클라이언트 금액 신뢰 안 함)

---

## 라이선스

Private
