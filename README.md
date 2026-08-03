# Inspic

**누구나 텍스트를 올리면 전자책과 오디오북이 만들어지는 출판 민주화 플랫폼**

---

## 해결하는 문제

| 문제 | 기존 상황 | Publedge 해법 |
|------|----------|--------------|
| 출판 진입장벽 | 전자책 제작에 전문 도구/지식 필요 | 텍스트만 업로드하면 자동 변환 |
| 오디오북 제작 비용 | 성우 섭외, 녹음 비용 수백만원 | AI TTS로 즉시 오디오북 생성 |
| 콘텐츠 유통 | 플랫폼별 포맷 변환, 개별 등록 필요 | 한번 업로드로 전자책 + 오디오북 동시 생성 |
| 리더 경험 분산 | 플랫폼마다 다른 리더 UX | PSA에서 검증된 통합 웹 리더 기반 |

## 차별점

1. **원스톱 파이프라인** — 텍스트 입력 → 전자책 → 오디오북 자동 생성
2. **검증된 리더기** — PSA에서 실사용 검증된 컴포넌트 + 훅 기반
3. **다국어 네이티브** — ko/en 지원 (next-intl)
4. **저작 도구 내장** — 별도 소프트웨어 없이 웹에서 직접 편집 (Tiptap 리치 에디터)

---

## 핵심 기능

### Phase 1 — 기반 구축 & 전자책 리더

- **사용자 인증**: Supabase Auth + Zustand authStore (회원가입/로그인)
- **텍스트 업로드**: 일반 텍스트, Markdown, DOCX 파일 업로드
- **콘텐츠 변환**: 업로드 텍스트 → 챕터 구조화 → 전자책 포맷 (DOMPurify XSS 방어)
- **전자책 리더**: 페이지네이션, 하이라이트, 북마크, 진행률 저장
- **내 서재**: 내가 만든/읽고 있는 전자책 목록 관리

### Phase 2 — 미디어 파이프라인 & TTS

- **TTS 오디오북**: OpenAI TTS API로 챕터별 오디오 생성 (Supabase Edge Function)
- **오디오 플레이어**: 파형 시각화, 배속 조절 (0.5x~2.0x), 볼륨, 키보드 단축키
- **PDF/EPUB 내보내기**: @react-pdf/renderer + 자체 EPUB 생성기
- **리치 텍스트 에디터**: Tiptap 기반, 이미지 삽입, 서식 편집

### Phase 3 — 탐색 & AI

- **탐색 페이지**: 검색, 장르 필터, 정렬 (최신/인기/평점)
- **AI 보조 기능**: 요약, 교정, 번역, AI 커버 생성
- **분석 대시보드**: 조회수, 독서 통계, 인기 하이라이트

### Phase 4 — 소셜 & 구독

- **리뷰 시스템**: 별점 (1-5) + 텍스트 리뷰
- **팔로우/언팔로우**: 작가 구독
- **구독 플랜**: Free / Pro / Premium 티어
- **협업 저작**: 공동 편집자 초대

---

## 기술 스택

```
프레임워크      Next.js 16 (App Router)
언어           TypeScript 5.9
UI            React 19
스타일링       Tailwind CSS 4
상태관리       Zustand 5
데이터 페칭    TanStack Query (React Query)
인증/DB       Supabase (Auth + PostgreSQL + Storage + Realtime + Edge Functions)
UI 컴포넌트    Radix UI + Lucide Icons
애니메이션     Framer Motion
에디터         Tiptap (리치 텍스트)
PDF           @react-pdf/renderer
TTS           OpenAI TTS API
XSS 방지      DOMPurify (isomorphic-dompurify)
i18n          next-intl (ko/en)
배포           Vercel
```

---

## 시스템 아키텍처

```
[사용자]
   │
   v
[Next.js Frontend (Vercel)]
   │
   ├── /upload ──────────> [콘텐츠 변환 파이프라인]
   │                           ├── 텍스트 파싱 (mammoth/marked)
   │                           ├── DOMPurify sanitize
   │                           ├── 챕터 분리 (자동/수동)
   │                           └── DB 저장 (Supabase)
   │
   ├── /reader/:bookId ──> [전자책 리더]
   │                           ├── useVirtualPaginator
   │                           ├── useHighlights / useBookmarks
   │                           └── useReadingProgress
   │
   ├── /listen/:bookId ──> [오디오북 플레이어]
   │                           ├── 챕터별 오디오 스트리밍
   │                           └── 재생 위치 동기화
   │
   v
[Supabase]
   ├── Auth (사용자 인증)
   ├── PostgreSQL (콘텐츠, 메타데이터, 사용자 데이터)
   ├── Storage (오디오 파일, 커버 이미지, 업로드 원본)
   ├── Realtime (TTS 생성 진행 상태 실시간 업데이트)
   └── Edge Functions (TTS 비동기 처리)
```

---

## 프로젝트 구조

```
src/
├── app/
│   ├── api/              # API Routes
│   │   ├── ai/           #   AI 기능 (요약, 교정, 번역, 커버)
│   │   ├── books/        #   책 CRUD + 상세/리뷰/협업/커버
│   │   ├── chapters/     #   챕터 CRUD
│   │   ├── epub/         #   EPUB 내보내기
│   │   ├── explore/      #   탐색 API
│   │   ├── follows/      #   팔로우/언팔로우
│   │   ├── pdf/          #   PDF 내보내기
│   │   ├── reader/       #   리더 API (북마크, 하이라이트, 진행률, 설정)
│   │   ├── reviews/      #   리뷰 CRUD
│   │   ├── subscription/ #   구독 관리
│   │   ├── tts/          #   TTS 생성 + 상태 조회
│   │   └── upload/       #   파일 업로드
│   ├── analytics/        # 분석 대시보드
│   ├── auth/             # 로그인/회원가입
│   ├── book/[bookId]/    # 책 상세 페이지
│   ├── create/           # 새 책 만들기 + 에디터
│   ├── dashboard/        # 내 서재
│   ├── explore/          # 탐색 페이지
│   ├── listen/[bookId]/  # 오디오북 플레이어
│   ├── reader/[bookId]/  # 전자책 리더
│   ├── settings/         # 사용자 설정
│   └── subscription/     # 구독 플랜
├── components/
│   ├── analytics/        # 차트, 통계 카드
│   ├── audio/            # 오디오 플레이어, TTS, 파형
│   ├── dashboard/        # 북카드, 메타데이터 폼, 내보내기
│   ├── editor/           # Tiptap 에디터, AI 어시스턴트, 협업
│   ├── explore/          # 검색바, 북그리드
│   ├── layout/           # Header, Footer, Sidebar
│   ├── reader/           # 리더 컴포넌트 (PSA 기반)
│   ├── social/           # 리뷰, 팔로우, 별점
│   ├── subscription/     # 플랜 카드
│   ├── ui/               # 공통 UI (Button, Card, Dialog, Toast 등)
│   └── upload/           # 파일 드롭존
├── hooks/                # 커스텀 훅 (오디오, 리더, 구독 등)
├── i18n/                 # 다국어 메시지 (ko/en)
├── lib/                  # 유틸리티 (Supabase, OpenAI, sanitize, PDF/EPUB)
├── stores/               # Zustand 스토어 (auth)
└── types/                # TypeScript 타입 정의

supabase/
├── functions/            # Edge Functions (TTS worker)
└── migrations/           # DB 마이그레이션 (Phase 1~3)
```

---

## 데이터 모델

### 핵심 테이블 (13개)

| 테이블 | 설명 | Phase |
|--------|------|-------|
| `user_profiles` | 사용자 프로필 (닉네임, 아바타, 소개) | 1 |
| `books` | 전자책 메타데이터 (제목, 상태, 공개 범위) | 1 |
| `chapters` | 챕터 콘텐츠 (HTML, 순서, 단어 수) | 1 |
| `reading_progress` | 독서 진행률 | 1 |
| `highlights` | 하이라이트 (텍스트 선택, 메모, 색상) | 1 |
| `bookmarks` | 북마크 | 1 |
| `reader_settings` | 리더 환경설정 (폰트, 테마, 줄간격) | 1 |
| `audiobooks` | 오디오북 메타데이터 (음성, 상태) | 2 |
| `audio_chapters` | 챕터별 오디오 파일 (URL, 길이) | 2 |
| `listening_progress` | 오디오 청취 진행률 | 2 |
| `reviews` | 리뷰 (별점 + 텍스트) | 3 |
| `follows` | 팔로우 관계 | 3 |
| `subscriptions` | 구독 플랜 | 3 |

모든 테이블에 RLS (Row Level Security) 정책이 적용되어 있습니다.

---

## TTS 오디오북 생성 파이프라인

```
[사용자: "오디오북 생성" 클릭]
    │
    v
[1. 대기열 등록] (Next.js API Route)
    ├── audiobooks 레코드 생성 (status: pending)
    └── 각 챕터별 audio_chapters INSERT
    │
    v
[2. Supabase Edge Function 처리]
    ├── content_html → 순수 텍스트 추출
    ├── 문장 경계에서 분할
    ├── OpenAI TTS API 호출
    └── Supabase Storage 업로드
    │
    v
[3. 실시간 진행 알림]
    └── Supabase Realtime으로 상태 변경 수신
    │
    v
[4. 오류 처리]
    ├── 최대 3회 재시도
    └── 부분 실패 허용 (10챕터 중 7개 성공이면 7개 재생 가능)
```

**비용**: 일반 책 1권 (50,000자) 약 $0.75 (OpenAI tts-1)

---

## 시작하기

### 사전 요구사항

- Node.js 18+
- npm
- Supabase 프로젝트 (Auth + PostgreSQL + Storage)
- OpenAI API Key (TTS, AI 기능)

### 설치

```bash
git clone https://github.com/Yngie-C/publedge.git
cd publedge
npm install
```

### 환경 변수

`.env.example`을 복사해 `.env.local`을 만들고 로컬 값으로 채웁니다. 실제 secret 값은 커밋하지 않습니다.

```bash
cp .env.example .env.local
```

필수/선택 환경변수 목록은 `.env.example`을 기준으로 관리합니다.

### DB 마이그레이션

Supabase 대시보드의 SQL Editor에서 마이그레이션 파일을 순서대로 실행합니다:

```
supabase/migrations/00001_phase1_schema.sql
supabase/migrations/00002_phase2_audio_schema.sql
supabase/migrations/00003_phase3_social_schema.sql
```

### 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.

### 검증

코드 변경 후 가능한 범위에서 아래 명령어를 실행합니다.

```bash
npm run lint
npm run typecheck
npm run build
```

### 빌드

```bash
npm run build
```

---

## 라우트 구조

```
/                          랜딩 페이지
/about                     서비스 소개
/faq                       자주 묻는 질문
/privacy                   개인정보처리방침
/terms                     이용약관
/auth/*                    인증 플로우
/dashboard                 내 서재
/library                   라이브러리
/my                        내 계정/내 콘텐츠 영역
/create                    새 콘텐츠 만들기
/create/upload             파일 업로드
/create/edit/:bookId       챕터 편집 (리치 에디터)
/create/preview/:bookId    출판 전 미리보기
/create/series             연재 시리즈 생성
/reader/:bookId            전자책 리더
/listen/:bookId            오디오북 플레이어
/book/:bookId              전자책 상세 (공개)
/author/:authorId          작가 공개 페이지
/explore                   탐색
/analytics                 분석 대시보드
/creator                   크리에이터 홈
/creator/analytics         크리에이터 분석
/notifications             알림
/payments/*                결제 플로우
/series/:seriesId          시리즈 상세
/settings                  사용자 설정
/studio                    스튜디오
```

---

## 보안

- **XSS 방지**: DOMPurify 이중 방어 (서버 저장 시 + 클라이언트 렌더링 시)
- **인증**: Supabase Auth + RLS 정책으로 데이터 접근 제어
- **파일 업로드**: MIME 타입 검증, 파일 크기 제한 (txt/md 5MB, docx 20MB)
- **Rate Limiting**: TTS 생성 동시 1건, API 디바운싱

---

## 비용 추정

| 항목 | 무료 | 성장 (DAU 100) | 규모 (DAU 1000) |
|------|------|----------------|----------------|
| Vercel | 무료 | $20 | $20+ |
| Supabase | Free | $25 | $25 + 스토리지 |
| OpenAI TTS | - | ~$75 | ~$750 |
| **합계** | **$0** | **~$120/월** | **~$800+/월** |

---

## 배포

Vercel을 통한 배포를 권장합니다:

```bash
npm run build   # 빌드 검증
vercel deploy   # Vercel 배포
```

---

## 라이선스

Private
