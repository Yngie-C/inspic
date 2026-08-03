# Inspic 재구성 계획 — 인터랙티브 워크북 MVP

> **이 문서는 2026-08-04 승인된 원본 계획입니다.** 진행 상황은 `TODO.md`, 마일스톤 요약은 `README.md`를 보세요.
>
> **확정된 결정 (계획 승인 시점)**
> | 항목 | 결정 |
> |---|---|
> | 핵심 베팅 | 인터랙티브 워크북 |
> | 첫 사용자 | 소수 저자 영입 + 본인 콘텐츠 병행 |
> | 코드 접근 | **1안 — 기존 레포 안에서의 재설계** |
> | TTS/오디오북 | 완전 삭제 |
> | 개발 속도 | 제약 아님 (게이트 통과가 우선) |
>
> **아래 "권고" 절의 미해결 조건은 해소되었습니다.**
> 2026-08-04, 사용자가 Supabase에 보존할 실사용 데이터가 없음을 확인했습니다.
> → **1안 확정. M1에서 마이그레이션 8개를 통합 리셋합니다.**
>
> **진행 상황**: M0 완료 (2026-08-04). 29,024줄 → 14,311줄, API 45 → 17.
> 삭제 이전 코드는 `pre-mvp-archive` 태그에 보존돼 있습니다.

## Context

### 왜 이 작업을 하는가

Inspic은 "구체적 기획 없이 기능에 기능을 더하는" 방식으로 6개월(2026-02 ~ 08, 커밋 65개) 개발되어 29,024줄 / 페이지 34개 / API 45개 / DB 테이블 21개에 도달했다. 그러나 코드 감사 결과, 문제는 **기능 부족이 아니라 만든 기능이 제품에 연결되지 않은 것**이다.

### 감사로 확인한 사실

**1. 리더기 전체가 제품에 도달하지 않는다 (가장 큰 문제)**

- `src/components/reader/ReaderLayout.tsx`(233줄)를 import하는 파일이 **0개**다.
- 그 하위 11개 컴포넌트(합계 1,289줄)는 전부 `ReaderLayout`에서만 참조된다 → 전량 사용처 0.
- `src/hooks/` **11개 훅 전체(1,474줄)**가 미사용이거나 죽은 리더 서브시스템에서만 참조된다.
- `/api/reader/*` 6개 라우트는 죽은 훅에서만 호출된다. `highlights/popular`, `highlights/share`는 호출처가 아예 없다.
- DB 테이블 `highlights`, `bookmarks`, `reading_progress`, `reader_settings`, `highlight_share_events`는 실사용 앱에서 기록되지 않는다.
- 실제 `/reader/[bookId]/page.tsx`는 **188줄짜리 챕터 넘김 페이지**이며 `fontSize={16}`, `theme="light"`가 하드코딩돼 있다. 뒤로가기는 `/dashboard`(→`/creator` 리다이렉트)로 보내, 독자가 크리에이터 스튜디오에 떨어진다.
- README가 대표 기능으로 광고하는 하이라이트·북마크·진행률·페이지네이션·폰트 설정이 **사용자에게 전혀 노출되지 않는다.**

**2. 문서와 코드가 다르다**

- `next-intl` 설치·설정·메시지 228줄 완비, `useTranslations` 사용처 **0**. "다국어 네이티브"는 사실이 아니다.
- README는 TTS를 OpenAI로 기술하나 코드 기본값은 qwen3(DashScope)다.
- README의 "장르 필터"에 해당하는 컬럼이 스키마에 없다(탐색은 언어/가격/정렬만).
- `subscriptions`는 마이그레이션 00005에서 삭제됐으나 README에 남아 있다.

**3. 중복·동결 자산**

- `/creator`(208줄)와 `/studio`(206줄)가 거의 동일한 크리에이터 대시보드로 둘 다 살아 있다. Header는 `/studio`, `creator/layout.tsx`는 `/creator`를 가리킨다.
- 시리즈 시스템(마이그레이션 175줄 + API 4개 + 페이지 3개 + 컴포넌트 6개)은 완성 후 UI에서 주석 처리됐다(`[SUN-68] 추후 활성화`).
- `VoiceCloner`/`VoiceDesigner`는 기능이 `TTSGenerateButton`(697줄)에 재구현되어 미사용이다.
- 테스트 0개.

### 살릴 부분의 구조 결함 (사용자 요청 항목)

**A. 워크북 데이터 모델 — 핵심 베팅을 직접 무력화한다**

인터랙티브 워크북이 제품의 베팅인데, **독자가 작성한 내용이 DB에 존재하지 않는다.**

- `src/lib/template-storage.ts`: 응답은 `localStorage`에만 저장(`publedge_template_{chapterId}_{nodeId}`). 기기 간 동기화·복구·서버 접근이 전부 불가능하다.
- 결과: 크리에이터는 독자 참여를 볼 수 없고, 서버 사이드 PDF 내보내기에 독자 작성분을 담을 수 없으며(TODO.md P2가 요구하는 기능), "내 워크북 다시 보기" 경험을 만들 수 없다.
- `ChecklistReader.tsx:33` — 저장된 응답을 **배열 인덱스와 길이로 매칭**한다(`saved.length === base.length`). 크리에이터가 체크리스트 항목을 하나만 추가/삭제해도 해당 블록의 독자 응답이 **조용히 전량 폐기**된다.
- `BaseTemplateNode.ts` — `parseHTML: (el) => el.getAttribute("data-node-id") || generateNodeId()`. `data-node-id`가 없으면 파싱할 때마다 새 UUID를 만든다. 속성이 유실되는 순간 저장 키가 바뀌어 응답이 사라진다.
- 템플릿 콘텐츠가 `data-items` 등 **HTML 속성 안의 JSON 문자열**로 인라인된다. 쿼리·집계·마이그레이션이 불가능하다.

→ 이 4가지는 버그가 아니라 **데이터 모델 결함**이다. 워크북으로 승부한다면 여기부터 다시 설계해야 한다.

**B. 결제 보상 트랜잭션 부재**

`src/app/api/payments/confirm/route.ts`:
- Toss 승인 성공 → `purchases` INSERT 실패 시 **돈은 빠져나가고 구매 기록이 없다.** 결제 취소(보상 트랜잭션)를 하지 않고 500만 반환한다.
- `purchases`에 `UNIQUE(user_id, book_id)`가 있어 재시도 시 23505로 실패한다.
- Webhook이 없어, 사용자가 결제 후 창을 닫으면(클라이언트가 confirm을 호출하지 않으면) 결제가 유실된다.
- 참고: `/api/payments/request`는 `book.price`를 서버에서 읽으므로 가격 위조에는 안전하다. 문제는 승인 이후 구간에 한정된다.

**C. 렌더링 아키텍처**

- 페이지 컴포넌트 50개 중 **30개가 `"use client"`**. 공개 책 상세·탐색·랜딩까지 클라이언트에서 `/api/*`를 fetch한다.
- 결과: 공개 콘텐츠에 SEO가 없고(콘텐츠 판매 제품에 치명적), 첫 화면이 인증→fetch 워터폴을 탄다.
- `/book/[bookId]/page.tsx`는 서버 컴포넌트라 부분적으로만 맞는 구조다.

**D. 인증**

- `auth-store.ts`가 `user_profiles`를 **클라이언트에서 두 경로**(`signUp`, `onAuthStateChange`)로 생성한다. `UNIQUE(user_id)` 덕에 사고는 안 나지만, 정석은 `auth.users` INSERT 트리거다.
- `lib/supabase/middleware.ts`가 `getUser()` 실패 시 `getSession()`으로 폴백한다. `getSession()`은 JWT를 **서버에서 검증하지 않는다** → 라우트 보호가 약해진다. (API 라우트는 `getAuthUser()`로 재검증하므로 방어선은 남아 있다.)

**정상인 부분**: `lib/supabase/{client,server,admin}.ts`, `api-utils.ts`, `sanitize.ts`, 업로드 파서(`upload/route.ts`), `epub-generator.ts`, `pdf-generator.tsx`, `toss-payments.ts`, Tiptap NodeView 26개 파일, UI 프리미티브.

---

## 접근 방식: 1안 vs 2안 비교

속도가 제약이 아니라는 전제로, 결정 기준은 **"어차피 다시 써야 하는 것 대비 그대로 쓸 수 있는 것의 비율"**이다.

| | 1안 — 기존 레포에서 재설계 | 2안 — 새 레포 재작성 |
|---|---|---|
| A(워크북 모델) 해결 비용 | 스키마 신설 + 리더 템플릿 리라이트 | 동일 (신규 설계) |
| B(결제) 해결 비용 | confirm 재작성 + webhook 추가 | 동일 |
| C(렌더링) 해결 비용 | 페이지 30개 점진 이관 | 처음부터 서버 우선 (더 깨끗) |
| D(인증) 해결 비용 | 트리거 이관 + 미들웨어 수정 | 동일 |
| 삭제 작업 | 죽은 코드 ~2,800줄 + TTS/시리즈/i18n 제거 필요 | 불필요 (안 가져오면 됨) |
| 그대로 가져오는 자산 | 그 자리에 있음 | 복사 필요하나 대부분 순수 모듈이라 쉬움 |
| 재작성해야 하는 자산 | 없음 | 인증 플로우, 업로드 UI, 에디터 셸, 결제 UI, 레이아웃, UI 프리미티브 |
| DB 정리 | 마이그레이션 8개 위에 삭제 마이그레이션 누적 | 스키마 1개로 깨끗하게 시작 |
| 회귀 위험 | 테스트 0 상태에서 대규모 삭제 → 예상 못한 결합 발견 가능 | 없음 (새로 검증) |
| 심리적 리셋 | 약함 — "또 붙이기" 습관이 재발하기 쉬움 | 강함 |

**핵심 관찰**: 2안이 실제로 절약하는 것은 "삭제 작업"뿐이고, 새로 치러야 하는 비용은 "이미 동작하는 인증/업로드/에디터 셸/결제 UI 재작성"이다. A~D는 **어느 안을 골라도 동일하게 치러야 한다.** 그리고 재사용 가치가 가장 큰 자산(Tiptap NodeView 26개 파일, EPUB/PDF 생성기, 업로드 파서, Toss 연동, sanitize)은 A~D와 대체로 직교해서 두 안 모두에서 살아남는다.

### 권고: 1안 — 단, "정리"가 아니라 "기존 레포 안에서의 재설계"로 정의한다

같은 레포를 쓰되 다음을 규율로 강제한다.

1. **M0에서 먼저 지운다.** 살릴 것을 고르는 게 아니라, MVP 범위 밖을 전부 삭제한 뒤 남은 것으로 시작한다.
2. **스키마를 새로 설계한다.** 마이그레이션 위에 마이그레이션을 얹지 않는다.
3. **기능 추가 동결.** M0~M5 동안 이 문서에 없는 기능은 추가하지 않는다.

**단, 다음 조건이면 2안이 낫다**: Supabase에 **보존해야 할 실사용 데이터가 이미 있는 경우**. 그러면 21개 테이블을 살린 채 정리해야 해서 1안의 DB 이점이 사라진다. 실사용자·실판매가 없다면(베타 저자 영입이 아직 플레이북 단계이므로 그럴 가능성이 높다) 1안 + **마이그레이션 통합 리셋**이 가장 깨끗하다. → **M0 첫 작업으로 이 사실을 먼저 확인한다.**

---

## MVP 정의

### 하나의 루프

> **크리에이터가 워크북형 전자책을 출간한다 → 독자가 구매해 읽으며 직접 작성한다 → 작성 내용이 계정에 남고 내보낼 수 있다 → 크리에이터가 참여 반응을 본다.**

이 루프가 끊김 없이 돌아가면 Inspic은 다른 전자책 플랫폼과 다른 제품이 된다. 그리고 **이 루프의 심장은 독자 응답 데이터인데, 지금 DB에 존재하지 않는다.** 그래서 응답 모델이 MVP의 1순위다.

### 범위에 포함 (IN)

- 인증: 이메일 + OAuth 1종
- 크리에이터: 책 생성 → 업로드(txt/md/docx) 또는 직접 작성 → 에디터에서 워크북 블록 삽입 → 미리보기 → 공개
- 워크북 템플릿 **5종만**: 체크리스트, 리플렉션(자유 서술), 스케일(1–10), SMART, 콜아웃
- **독자 응답 DB 저장 + 기기 간 동기화**
- 리더 1개 (단일 경로, 하드코딩 제거)
- 유료 판매(Toss) + 접근 제어
- 내 워크북: 작성 결과 모아보기 + 내보내기
- 크리에이터 지표: 판매 수, 블록별 응답 참여율

### 범위에서 제외 — 삭제 (OUT)

| 대상 | 규모 |
|---|---|
| TTS/오디오북 전체 | `lib/tts.ts` 486줄, `components/audio/` 9파일, `tts-worker`, API 6개(tts 2 + voices 4), `/listen` 444줄, 테이블 4개(`audiobooks`, `audio_chapters`, `listening_progress`, `custom_voices`), `lamejs` 의존성 |
| 죽은 리더 서브시스템 | 컴포넌트 12개 1,289줄, 훅 11개 1,474줄, API 6개, 테이블 5개 |
| 시리즈 시스템 | 마이그레이션 175줄, API 4개, 페이지 3개, 컴포넌트 6개, `notifications` |
| i18n | `next-intl`, `src/i18n/`, 메시지 228줄 |
| 워크북 템플릿 7종 | Toggle, ColumnList, BeforeAfter, Quadrant, OKR, HabitTracker, WOOP — 응답 스키마 확정 후 재도입 |
| AI 보조 | `/api/ai/*` 4개, `AIAssistantPanel` 477줄 |
| 협업 저작 | `collaborators` 테이블, `CollaboratorPanel` 337줄 |
| 리뷰·팔로우 | `reviews`, `follows`, `components/social/` |
| 중복 라우트 | `/creator`·`/studio` 중 하나, `/my/library`·`/my/purchases` 통합 |

> 삭제는 되돌릴 수 있어야 한다. M0 시작 전 `pre-mvp-archive` 태그를 만들어 두면 언제든 참조 가능하다.

---

## 마일스톤

속도가 제약이 아니므로 주차가 아닌 **게이트**로 정의한다. 게이트를 통과하지 못하면 다음으로 가지 않는다.

### M0 — 결정과 삭제

- Supabase 실사용 데이터 유무 확인 → 1안/2안 최종 확정, 마이그레이션 통합 리셋 여부 결정
- `pre-mvp-archive` 태그 생성
- 위 OUT 목록 전량 삭제
- `/creator`·`/studio` 중 하나로 통합, `dashboard`/`library`/`analytics`/`settings` 리다이렉트 정리
- README·AGENTS.md를 실제 코드와 일치시킴 (허위 기능 서술 제거)

**게이트**: `npm run lint && npm run typecheck && npm run build` 통과. 남은 라우트 전부가 실제로 도달 가능. 미사용 export 0.

### M1 — 도메인 재설계

- 새 스키마 작성. 핵심은 **워크북 응답 테이블**:
  - 응답은 `(user_id, book_id, chapter_id, block_id, 필드키)` 단위로 저장 — 배열 인덱스 매칭 금지
  - `block_id`는 크리에이터가 블록을 만든 시점에 **한 번 부여되고 절대 재생성되지 않는다** (`BaseTemplateNode`의 `|| generateNodeId()` 폴백 제거)
  - 블록 정의(문항)와 독자 응답을 분리 저장 → 크리에이터가 항목을 추가/삭제해도 기존 응답이 살아남는다
  - RLS: 응답은 작성자 본인만 읽기/쓰기, 크리에이터는 **집계만** 조회
- 인증: `user_profiles` 생성을 `auth.users` INSERT 트리거로 이관, 클라이언트 생성 경로 2개 제거
- `middleware.ts`의 `getSession()` 폴백 제거 또는 보호 로직에서 배제

**게이트**: 마이그레이션이 빈 DB에 적용된다. 응답 저장/복원 단위 테스트 통과. 크리에이터가 문항을 추가/삭제해도 기존 응답이 보존되는 시나리오 테스트 통과.

### M2 — 워크북 저작 (크리에이터 루프)

- 템플릿 5종의 Tiptap NodeView를 새 `block_id` 규약에 맞게 조정 (`components/editor/extensions/templates/` 기존 자산 활용)
- 템플릿 콘텐츠를 `data-*` JSON 인라인에서 조회 가능한 형태로 이관
- 에디터 이미지: base64 인라인(`RichTextEditor.tsx:128`) → Supabase Storage 업로드로 교체
- 업로드 파싱 로직을 `route.ts`에서 `src/lib/upload-parser.ts`로 분리
- 공개 전 체크리스트 + `/create/preview/[bookId]`를 최종 검수 화면으로

**게이트**: 원고 업로드 → 워크북 블록 5종 삽입 → 미리보기 → 공개까지 막힘 없이 완주. 본인 콘텐츠 1권을 이 경로로만 만들어 본다.

### M3 — 워크북 독서 (독자 루프) ← 여기서 처음으로 제품이 존재한다

- 리더 1개로 통일. 하드코딩된 `fontSize`/`theme` 제거
- 리더 템플릿 5종을 **DB 응답 기반으로 재작성** (`localStorage`는 오프라인 캐시로만, 진실의 원천은 DB)
- 저장 상태 표시(저장 중/저장됨/오프라인), 낙관적 업데이트
- 뒤로가기 목적지 수정 (독자를 크리에이터 스튜디오로 보내지 않는다)

**게이트**: 기기 A에서 작성 → 기기 B에서 이어서 작성이 동작한다. 크리에이터가 챕터를 수정·재발행해도 독자 응답이 유지된다.

### M4 — 판매와 접근 제어

- `payments/confirm` 재작성: 승인 후 실패 시 **결제 취소 보상 트랜잭션**, 멱등 처리
- Toss webhook 추가 → 클라이언트 confirm 미호출 시에도 결제가 유실되지 않음
- `purchases`의 `UNIQUE(user_id, book_id)`를 재시도 가능한 형태로 조정
- `access-control.ts` 정리, 유료 콘텐츠 미리보기 정책 확정 (첫 챕터 무료 등)

**게이트**: 테스트 결제로 성공/실패/중복/창닫음 4개 시나리오 검증. 승인은 됐는데 구매 기록이 없는 상태가 재현되지 않는다.

### M5 — 응답 회수

- `/my/workbook`: 내가 작성한 워크북 모아보기
- 응답 포함 내보내기 (PDF — `pdf-generator.tsx` 재사용, 이제 서버가 응답을 읽을 수 있으므로 가능)
- 크리에이터 지표: 판매 수, 블록별 응답 참여율 (개별 응답 내용은 비공개)

**게이트**: 독자가 작성한 워크북을 PDF로 받아 볼 수 있다. 크리에이터가 "어느 블록에서 독자가 이탈하는지" 볼 수 있다.

### M6 — 실사용 검증

- 본인 콘텐츠 1권을 워크북으로 정식 출간
- `creator-outreach/` 플레이북으로 저자 2~3명 영입, 온보딩 동행
- 피드백 수집 → 템플릿 7종 재도입 여부, 다음 베팅 결정

**게이트**: 본인이 아닌 크리에이터가 도움 없이 1권을 출간한다. 독자 유료 구매 1건 + 워크북 작성 완료 1건.

---

## 검증 전략

테스트 0에서 시작하므로 전면 커버리지를 노리지 않는다. **회귀가 치명적인 3곳만** 먼저 덮는다.

1. `src/lib/sanitize.ts` — script/이벤트 핸들러 제거, 허용 태그 유지, `data-*` 보존(템플릿이 여기에 의존)
2. `src/lib/access-control.ts` — owner / 무료공개 / 비공개 / 구매자 / 비구매자
3. **워크북 응답 저장·복원** — 문항 추가·삭제·순서변경 후에도 기존 응답 보존 (M1 게이트의 핵심)

여기에 E2E 1개: 로그인 → 책 생성 → 워크북 블록 삽입 → 공개 → 다른 계정으로 구매 → 읽으며 작성 → 재접속 시 복원.

도구: Vitest + React Testing Library, E2E는 Playwright.

각 마일스톤 종료 시 `npm run lint && npm run typecheck && npm run build`를 모두 통과해야 한다.

---

## 주요 파일

| 목적 | 경로 |
|---|---|
| 새 스키마 | `supabase/migrations/` (통합 리셋 검토) |
| 워크북 응답 로직 | `src/lib/template-storage.ts` (전면 재작성) |
| 블록 ID 규약 | `src/components/editor/extensions/templates/BaseTemplateNode.ts` |
| 리더 템플릿 5종 | `src/components/reader/templates/` (DB 기반 재작성) |
| 리더 진입점 | `src/app/reader/[bookId]/page.tsx` |
| 렌더러 | `src/components/reader/HtmlContentRenderer.tsx` (재사용 가능) |
| 결제 승인 | `src/app/api/payments/confirm/route.ts` (재작성) |
| 인증 | `src/stores/auth-store.ts`, `src/lib/supabase/middleware.ts` |
| 업로드 파서 분리 | `src/app/api/upload/route.ts` → `src/lib/upload-parser.ts` |
| 그대로 재사용 | `src/lib/{sanitize,api-utils,epub-generator,pdf-generator,toss-payments}.ts`, `src/lib/supabase/*` |

---

## 이 계획이 "어중간함"을 막는 방식

지금까지의 실패 패턴은 **기능을 만들고 연결하지 않은 것**이다(리더기 2,763줄이 사용처 0인 게 그 증거다). 그래서 마일스톤을 기능 단위가 아니라 **루프 단위**로 끊었고, 모든 게이트를 "코드가 존재한다"가 아니라 **"사용자가 끝까지 통과한다"**로 정의했다. M3 게이트를 통과하기 전까지 이 제품은 존재하지 않는 것으로 취급한다.
