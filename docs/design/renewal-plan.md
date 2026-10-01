<!-- 기기 간 인수인계용 사본. 원본은 로컬의 ~/.claude/plans/zesty-kindling-moonbeam.md와 메모리 frontend-minimal-renewal이다. 새 기기에서는 이 파일부터 읽는다. -->

# Inspic 프론트엔드 비주얼 리뉴얼 — 리서치 기반 계획

> **단계 5 완료 (2026-10-01, 평가 5회차, 미커밋)**:
> - 임시 변형 스위치(`ui/design-variants.tsx`, dev `?callout=`/`?cover=`)를 지웠다. Callout은 `WorkbookBlock shape="line"`(읽기·편집 뷰 모두), 표지는 옅은 면 3종이 기본값이다.
> - 4회차 점수: 리더 구성 3점, 책 상세 기능 전달 3점, 나머지 4점. 고친 것: 인용문 1px·16px, 미리보기 안내 버튼 이름("책 정보 보기")과 박스 제거, 해요체 통일, `text-wrap: pretty`, 구매자 "구매 보유 중", 목차 첫 장 "미리보기", "전체 N권".
> - **5회차: 3그룹 × 6기준 모두 4점. 루프 종료.** 남은 다듬기 후보:
>   - 리더: 미리보기 중 상단 바가 warning("이 기기에만 저장됨")이라 본문 info 안내와 색이 어긋남(`SaveStatusBadge`). 저장 실패 시 accent 포커스 링과 danger 문장이 붙음. dev 미리보기 목이 2장을 엶.
>   - 책 상세: "구매 보유 중"이 다른 사실과 같은 무게. 공유 실패가 조용함(`ShareButton`).
>   - 탐색: 권수가 적을 때 인기 줄과 전체 그리드가 거의 같은 책. 두 번째 섹션에 label 제목이 없음.
> - **사용자 결정(2026-10-01, 결정 보드 https://claude.ai/artifact/J4i2nN3TmKHv7ydEo8LPWv)**, 반영 완료:
>   1. chiffon 표지의 제목·`INSPIC` 로즈우드 유지 → DESIGN.md accent 허용 목록에 추가
>   2. 리더 목차 현재 장 번호는 잉크(accent 제거)
>   3. 랜딩: 히어로 "적용하세요" 잉크, 기능 아이콘 사각 배경 제거, 책 0권이면 "이미 N권" 문장 숨김. 가운데 정렬 히어로와 3카드 구성은 2차
>   4. 미리보기 중 상단 바는 info "미리보기 · 이 기기에만"(`SaveStatusBadge isPreview`, 테스트 추가)
>   5. 공유 링크 복사 실패 시 버튼 줄 아래 danger 문장(`role="alert"`)
>   6. 탐색: 전체 12권 이하면 인기 줄 숨김(`POPULAR_MIN_TOTAL`), 전체 목록에 label 제목 "전체". `/dev/explore?popular`로 강제 표시
> - 남은 다듬기 후보(평가 5회차, 결정하지 않음): 저장 실패 시 accent 포커스 링과 danger 문장이 붙음, "구매 보유 중"의 무게, dev 미리보기 목이 2장을 엶.
> - **환경 주의**: 워크트리 경로가 한글이면 Turbopack(dev·build 모두)이 `start byte index … is not a char boundary`로 패닉한다. `next dev --webpack`, `next build --webpack`을 쓴다.
> - 캡처 스크립트는 상태를 입력으로 만든 뒤 찍어야 한다(`?mode=error`는 입력 전에는 정상 화면과 같다).

> **다음 세션 시작 가이드** (2026-10-01 갱신, 단계 4 완료 후)
>
> **작업 위치**: 워크트리 `~/orca/workspaces/inspic/Frontend-재점검`(브랜치 `Yngie-C/Frontend-재점검`). 트리는 깨끗하고 푸시는 하지 않았다.
>
> **커밋** (모두 미푸시):
> - `981d997`: 1단계 정리
> - `5e944af`: `DESIGN.md`, `docs/design/brief.md`, `AGENTS.md` 규칙
> - `f076d7d`: 목업 원본
> - `7b511b3`: 단계 3(토큰과 프리미티브 교체)
> - `639fb30`: 단계 4(핵심 루프 화면 + 나머지 라우트 토큰 치환)
>
> **결정 요약**: 형용사는 명료한·도구적인·가벼운. 색은 무드보드 4색(Coffee `#2D120D`, Rosewood `#6B0B0C`, Chiffon `#FFF8CA`, Botticelli `#CDE3E8`). 폰트는 Pretendard. 목업은 **A 절제안**(https://claude.ai/artifact/JWt3TnvjEoMmCygwfatuGc). 권위 문서는 루트 `DESIGN.md`다.
>
> **지금 코드의 구조** (단계 5에서 고칠 때 여기부터 본다):
> - 토큰: `src/app/globals.css`의 `@theme static`. 색은 `primary`, `muted`, `faint`, `accent`, `on-accent`, `paper`, `surface`, `mark`, `line`, `line-strong`, `field`, `field-line`, 상태색 4개. 타이포는 `text-display`~`text-code`(굵기·행간 포함). 반경은 `rounded-xs`~`lg`(8이 최대). 새 text 크기 토큰은 `cn()`(`src/lib/utils.ts`)에도 등록한다.
> - `.reader-content`/`.prose` 규칙은 `@layer components` 안에 있다(밖에 두면 블록의 유틸리티를 덮는다). `body`에 `word-break: keep-all`.
> - UI 프리미티브: `src/components/ui/`(button, card, input, spinner, toast, dropdown-menu, `book-cover`, `workbook-block`).
> - 워크북 블록 5종: 읽기 뷰 `components/reader/templates/*Reader.tsx`, 편집 뷰 `editor/extensions/templates/*NodeView.tsx`. 둘 다 `ui/workbook-block.tsx`를 쓴다. 상태 문구는 `lib/workbook/block-status.ts`(테스트 있음). 블록별 저장 상태는 `WorkbookResponsesProvider`의 `blockSaves`.
>   - "저장됨"은 이번 세션에서 저장에 성공한 경우에만 쓴다. 불러온 답은 "작성함"이다(서버 답인지 캐시에만 있는 답인지 구분할 수 없다).
> - 리더: `components/reader/ReaderView.tsx`(데이터 로딩은 `app/reader/[bookId]/page.tsx`). 책 상세: `app/book/[bookId]/BookDetailView.tsx`(로딩은 `BookDetailClient.tsx`). 탐색: `components/explore/*`, `app/explore/page.tsx`.
>
> **다음 할 일: §4 단계 5(평가 루프)**
> - 대상 화면은 다음과 같다. 모두 dev 서버에서 목 데이터로 뜨고, 프로덕션에서는 404다.
>   - `/dev/reader`: `?mode=local|error|preview`로 저장 불가·저장 실패·미리보기 상태를 본다.
>   - `/dev/book`: `?as=owner|preview`로 소유자·미리보기 화면을 본다.
>   - `/dev/explore`, `/dev/components`
> - **Supabase 새 프로젝트는 `books`가 0행이다.** 실제 라우트(`/reader/…`, `/book/…`, `/explore`)로 평가하려면 사용자가 책을 발행해야 한다. 운영 DB에 테스트 데이터를 넣기 전에는 사용자에게 먼저 묻는다.
> - 채점은 §4 단계 5의 루브릭을 쓴다. 생성과 평가는 분리한다.
> - 알려진 남은 항목(2차 레이아웃 후보): 아이콘을 원·사각 배경에 올린 곳(랜딩 `FeaturesSection`, `upload/FileDropzone`, about 번호 원), 랜딩 가운데 정렬 hero, 체크리스트·척도 블록에 질문 문구 데이터가 없는 점(블록 스키마 변경 필요), 에디터의 이탤릭 버튼(기능이라 유지), `epub-generator.ts`의 `#000`(EPUB 출력용).
>
> **검증 방법**:
> - `npx tsc --noEmit`, `npx vitest run`(현재 328개 통과. `.env.local`이 있어 Supabase 연동 테스트도 돈다), `npm run build`.
> - ESLint 기존 오류는 9개다(`SearchBar.tsx:43` setState-in-effect, `SlashCommandMenu`, `PreviewFrame`, `FileDropzone`). 이보다 늘면 안 된다.
> - 금지 패턴 grep(0건이어야 함, `src/app/dev/` 제외): `bg-gradient|from-[a-z]+-[0-9]|blur-\[|backdrop-blur|hover:-translate-y|hover:shadow|hover:scale|rounded-(xl|2xl|3xl)|(gray|slate|zinc|neutral|stone)-[0-9]|(purple|violet|indigo|blue)-[0-9]|brand-`
> - 스크린샷: `npx -y playwright@latest screenshot --full-page --wait-for-timeout=2500 --viewport-size=1280,800 <url> out.png`(390x844 모바일도). zsh에서는 인자를 변수 하나로 넘기면 단어 분리가 안 되니 함수로 감싼다. sticky 헤더는 full-page 캡처에서 중간에 찍힐 수 있다(캡처 아티팩트).
> - 상호작용 검사: `PW=$(dirname $(dirname $(readlink -f $(npx -y -p playwright@latest which playwright))))` 후 `.mjs`에서 `import { chromium } from "$PW/playwright/index.mjs"`. 모드마다 `newContext()`를 새로 만든다(localStorage 응답 캐시가 이전 실행에서 넘어온다).
>
> **주의**:
> - **Turbopack dev는 `globals.css` 수정을 놓친다.** CSS를 고친 뒤에는 dev 서버를 끄고 `rm -rf .next/dev` 후 재시작한다.
> - `npm run build` 전에는 dev 서버를 끈다.
> - 일괄 치환 스크립트에서 구분 문자로 NUL(`\x00`)을 쓰지 않는다. `lib/workbook/engagement.ts`와 `response-payload.ts`는 키 구분자로 NUL을 쓴다.
> - 결정 전에는 선택지를 먼저 비교한다(되돌리기 어려운 것만).

## Context
1단계(불필요 기능 정리)가 끝났다. 다음은 비주얼 전면 리뉴얼이다. 사용자는 코드를 바로 고치지 않고
"AI 툴로 실서비스 수준(AI-slop 최소화) 디자인을 만든 사례와 그 과정"을 먼저 조사한 뒤 계획을 세우길 원한다.
1차 범위는 **핵심 루프 우선**(리더/워크북 블록 5종, 책 상세, 탐색 카드)으로 확정했다. M6 실사용 검증을 앞두고 있다.

---

## 1. 리서치: 사례와 시점 (최신순, 2026-09-30 기준)

| 게시일 | 경과 | 출처 | 종류 | 핵심 |
|---|---|---|---|---|
| 2026-09-24* | 1주 | Chyrkov, *Real AI design workflow* | 디자이너 워크플로 | 레퍼런스(Mobbin 등) 기반 브리프 → 생성 → 비평 → 반복. "AI는 취향이 없다" |
| 날짜 미상 (v2.0.0) | ? | `tonymfer/design-loop` | 오픈소스 도구 | 섹션별 스크린샷을 5기준(구성·타이포·색/대비·정체성·완성도)으로 1~5점 채점하고 상위 3개 문제를 고친다. 전 기준 4점 이상이 2회 연속이면 멈춘다 |
| 2026-07-24 | 2개월 | Anthropic, *Claude Design을 만든 디자이너의 사용법* (Nate Parrott) | 1차 출처 | 폰트·색·무드보드로 방향을 먼저 지정한다. 브랜드 자산으로 디자인 시스템을 만든 뒤 탐색하고, 코드로 옮길 때는 Claude Code에 넘긴다 |
| 2026-06 | 3개월 | Claude Design 업데이트 (디자인 시스템 import, `/design-sync`) | 제품 기능 | Git이나 파일에서 시스템을 가져온다. Design과 Code가 양방향으로 동기화된다 |
| 2026-04-28 | 5개월 | MindStudio, *AI slop 피하기* | 가이드 | "명세에서 말하지 않은 것은 기본값이 된다." 정확한 hex·폰트명, 금지 목록, 컴포넌트를 먼저 검증한 뒤 페이지로 간다 |
| 2026-04-27 | 5개월 | MindStudio, *Design vs Code* | 비교 | **기존 코드베이스가 있으면 Claude Code**, 방향 탐색은 Design, 둘을 섞는 하이브리드 |
| 2026-04-22 | 5개월 | Lenny's Newsletter | 실사용 평가 | 랜딩·덱·탐색에는 강하다. 제품 UI를 반복 다듬는 데는 비용이 크다(한도 소진) |
| 2026-04-22 | 5개월 | developersdigest, *16 slop patterns* | 체크리스트 | Inter·보라·그라디언트/glow, 가운데 hero와 배지, 아이콘 카드 3개, 이모지 내비 등 |
| 2026-04-20 | 5개월 | Goldfinch 블로그 (실제 배포) | **출시 사례** | 기존 사이트에서 시스템을 추출하고 Design → handoff → Code로 옮겨 배포했다. 모바일 대응과 간격 미세 조정은 수작업이었다 |
| 2026-04 | 5개월 | Google `DESIGN.md` 스펙 | 표준 | YAML 토큰과 산문(의도·금지)을 한 파일에 둔다. `npx @google/design.md lint` |
| 2026-03-24 | 6개월 | Anthropic Engineering, *Harness design* | 1차 출처 | 생성자와 회의적 평가자를 분리한다. Playwright로 실제 화면을 보고 4기준(디자인 품질·**독창성**·완성도·기능)으로 채점하며 5~15회 반복한다 |
| 2025-11-12 | 10개월 | Anthropic, *frontend-design skill* | 1차 출처 | slop의 원인은 분포 수렴이다. 타이포·색·모션·배경 4축의 규칙을 둔다. 대담함은 한 곳에만 쓴다 |

\* 페이지 표기 날짜. 최초 게시일이 아니라 수정일일 수 있다.

**시점 관찰**
- "실제 출시" 사례는 대부분 **2026년 4월 Claude Design 출시 직후**에 몰려 있다. 7~9월 자료는 출시 사례보다 워크플로 가이드와 도구(평가 루프)가 중심이다.
- 2차 블로그에 돌던 "디자인 불일치 62% 감소" 같은 수치는 원 출처를 확인하지 못해 제외했다.
- 최신 1차 출처(7월, Parrott)와 4월 비교 글의 결론은 같다: **방향 탐색은 Design, 기존 코드베이스 구현은 Code.** 시간이 지나며 바뀐 점은 Design에 시스템 import와 `/design-sync`가 붙어 두 도구 사이 이음매가 매끄러워졌다는 것이다(6월).

### 사례들의 공통 원칙
1. 코딩 전에 방향(목적·사용자·레퍼런스·형용사 3개)을 먼저 정한다.
2. 토큰은 정확한 값으로 적고, 금지 목록은 명시한다. 말하지 않은 것은 기본값이 된다.
3. 컴포넌트를 먼저 검증한 뒤 페이지로 넓힌다.
4. 생성과 평가를 분리한다. 스크린샷 루브릭으로 채점하고, 최종 판단은 사람이 한다.
5. 권위 있는 단일 문서(`DESIGN.md`)를 둔다.

---

## 2. 현재 코드베이스 진단 (Explore 결과)
- **스택**: Next.js 16 App Router, React 19, Tailwind v4(`@theme inline`, 설정 파일 없음). Radix, cva, lucide, framer-motion, Tiptap 3을 쓴다.
- **토큰**: `src/app/globals.css`에 orange `brand-*`만 있다. `--color-brand-primary*`는 미사용이다. 타이포 스케일, radius, shadow 토큰은 없다. `gray-*`가 약 700회, `brand-*`가 35회 쓰였다. 기본 `Button`이 `bg-gray-900`이다.
- **폰트 결함**: `src/app/layout.tsx`에서 Geist와 Playfair를 `latin` subset만 불러온다. **한글은 시스템 폰트로 대체**되고, Playfair가 한글 hero에 걸려 있다(`HeroSection.tsx:30`).
- **Slop 징후**:
  - 무지개 그라디언트 표지 배열이 5곳에 복붙되어 있다(`explore/page.tsx:30`, `BookPreviewCard.tsx:18` 등).
  - blur glow blob(`HeroSection.tsx:22`, 로그인·가입·about)이 있다.
  - 아이콘 카드 3개(`FeaturesSection.tsx`), hover lift, `backdrop-blur` 헤더가 있다.
  - 이모지 콜아웃(`CalloutReader.tsx:31`)이 있다.
  - 보라 성찰 블록(`ReflectionNodeView.tsx:11`)이 있다.
- **디자인·브랜드 문서 없음.** 제품 정의는 README에 있다: "읽는 책이 아니라 적용하는 책 — 인터랙티브 워크북 출판 플랫폼".

---

## 3. 도구 경로 비교 (최신 자료 반영)

| | A. 코드 우선 + 평가 루프 | B. Claude Design 탐색 → Code | C. 방향 목업 3안 → 코드 우선 |
|---|---|---|---|
| 근거 시점 | 2025-11 스킬, 2026-03 harness, design-loop | 2026-04 출시 사례, 06 `/design-sync`, 07 Parrott | 07 Parrott의 "탐색 먼저", 04 Lenny's "3안 비교" |
| 장점 | 번역 손실 없음. Tiptap 에디터와 리더 등 실제 컴포넌트에서 바로 검증 | 시각 탐색이 가장 빠르다. 3안을 나란히 보여준다 | 방향 결정은 가볍게, 구현은 A와 같다 |
| 비용·리스크 | 방향을 코드로 탐색하므로 무겁다. 첫 방향이 틀리면 되돌리는 비용이 크다 | 제품 UI를 반복 다듬는 비용이 크다(한도 소진 사례). 모바일과 간격은 수작업이었다. 한글 타이포 검증 사례는 없다 | 목업과 실제 컴포넌트 사이 번역 단계가 한 번 생긴다 |
| 포기하는 것 | 초기의 넓은 탐색 | 코드베이스 인식(Tiptap NodeView 등) | 약간의 시간 |

**결정 (사용자 선택, 2026-09-30): C (탐색 매체는 Claude Design 또는 단일 HTML).**
- 최신 1차 출처는 모두 "탐색 먼저, 구현은 Code"다.
- Inspic에는 기존 코드베이스와 Tiptap 커스텀 블록이 있어서 구현은 A 방식이 맞다.
- 방향을 잘못 고르는 것이 가장 되돌리기 어려운 결정이므로, 이 결정만 싸게 3안으로 비교한다.
- **추천이 바뀌는 조건**: 무드보드와 레퍼런스가 이미 확정돼 있으면 탐색 단계가 필요 없으므로 A가 낫다.

---

## 4. 실행 계획 (1차: 핵심 루프)

**단계 0 — 방향 브리프** (사용자 참여, 코드 없음)
- 레퍼런스를 5~10개 모은다. 출판·에디토리얼, 노트·저널링 앱, 워크북 인쇄물 등이다.
- 형용사 3개와 금지 목록을 정한다.
- 산출물: `docs/design/brief.md`

**단계 1 — 방향 3안 탐색**
- 리더 1페이지(본문과 워크북 블록 2~3개)와 책 상세를 방향별로 목업한다.
- 사용자가 1안을 고르거나 섞는다.

**단계 2 — `DESIGN.md` 확정** (Google 스펙 형식, 레포 루트)
- 색(역할별 hex), 한글 우선 타이포(본문 serif/sans 결정, subset 포함), 간격, radius, shadow 정책, 모션 정책을 정한다.
- 금지 목록에는 §2의 slop 징후를 모두 넣는다.
- `npx @google/design.md lint`로 검증한다.
- `AGENTS.md`에 "UI 작업 전 DESIGN.md 참조"를 한 줄 추가한다.

**단계 3 — 토큰과 프리미티브 교체** (`executor`)
- `src/app/globals.css`: `@theme`을 DESIGN.md 토큰으로 재정의한다. 미사용 `--color-brand-primary*`는 삭제한다.
- `src/app/layout.tsx`: 한글 폰트를 도입한다(예: Pretendard 또는 선택한 serif). Playfair와 Geist 사용처를 정리한다.
- `src/components/ui/`(button, card, input, spinner, toast): 토큰 기반으로 다시 쓴다.
- 무지개 표지 배열 5곳을 공용 `BookCover` 플레이스홀더 하나로 합친다.
- 컴포넌트 검증 페이지(버튼 3상태, 입력, 카드)를 띄워 스크린샷으로 확인한다.

**단계 4 — 핵심 루프 화면**
- `src/app/reader/[bookId]/page.tsx`와 `src/components/reader/templates/*`(블록 5종 읽기 뷰)
- `src/components/editor/extensions/templates/*NodeView.tsx`(편집 뷰; 읽기 뷰와 시각 언어 통일)
- `src/app/book/[bookId]/BookDetailClient.tsx`, `src/components/explore/BookPreviewCard.tsx`, `src/app/explore/page.tsx`
- 나머지 라우트(랜딩, 대시보드, 결제, 인증)는 토큰만 받는다. 레이아웃 리뉴얼은 2차로 미룬다.

**단계 5 — 평가 루프** (생성과 평가 분리)
- 평가자 에이전트가 Playwright나 Chrome으로 데스크톱(1280)과 모바일(390)을 캡처한다.
- 채점 기준은 harness 4기준과 design-loop 5기준을 합친 루브릭이다.
- §2 금지 목록을 grep으로 자동 검사한다.
- 전 기준 4/5 이상이면 멈추고, 최대 5회 반복한다. 최종 판단은 사용자가 한다.

## 5. 검증
- `npm run build`와 타입체크, 기존 테스트를 통과한다.
- 금지 패턴 grep이 0건이어야 한다: `from-purple`, `blur-\[`, `backdrop-blur`, 이모지, `from-blue-400 to-indigo-600`
- 한글 폰트가 실제로 적용됐는지 확인한다. DevTools computed font와 스크린샷으로 본다.
- 리더에서 워크북 블록 5종의 작성·저장 플로우가 기능 회귀 없이 동작하는지 브라우저로 확인한다.
- 모바일 390px 스크린샷을 검토한다.

## Sources
- Anthropic, Improving frontend design through Skills (2025-11-12) — https://claude.com/blog/improving-frontend-design-through-skills
- Anthropic Engineering, Harness design for long-running apps (2026-03-24) — https://www.anthropic.com/engineering/harness-design-long-running-apps
- Goldfinch (2026-04-20) — https://www.goldfinch.me/blog/from-design-system-to-deployed-code-a-weekend-with-claude-design
- Lenny's Newsletter (2026-04-22) — https://www.lennysnewsletter.com/p/what-claude-design-is-actually-good
- developersdigest (2026-04-22) — https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it
- MindStudio (2026-04-27, 04-28) — https://www.mindstudio.ai/blog/claude-design-vs-claude-code-ui-prototypes , https://www.mindstudio.ai/blog/claude-design-avoid-ai-slop-design-system
- Google DESIGN.md — https://github.com/google-labs-code/design.md
- explainx, Claude Design June update — https://explainx.ai/blog/claude-design-june-2026-update-design-sync-2026
- Anthropic, Nate Parrott (2026-07-24) — https://claude.com/blog/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them
- Chyrkov (2026-09-24*) — https://sergeichyrkov.com/blog/real-ai-design-workflow-avoid-ai-slop
- design-loop — https://github.com/tonymfer/design-loop

---

## 부록: 진행 기록 (메모리 사본, 2026-10-01)

작업 위치: 워크트리 `~/orca/workspaces/inspic/Frontend-재점검`(브랜치 `Yngie-C/Frontend-재점검`).

**1단계**(불필요 기능 정리)는 커밋 `981d997`에 반영됐다.

**비주얼 리뉴얼**의 상위 계획은 `~/.claude/plans/zesty-kindling-moonbeam.md`에 있다. 2026-09-30 기준 진행 상황:
- 단계 0~2 완료. 커밋 `5e944af`, `f076d7d`(미푸시)
  - `docs/design/brief.md`: 방향 브리프
  - 루트 `DESIGN.md`: Google 스펙. lint 결과 0 error, 0 warning
  - `AGENTS.md`: "UI 작업 전 DESIGN.md" 규칙 한 줄 추가
- 사용자 결정 사항:
  - 형용사: 명료한·도구적인·가벼운
  - 색: 무드보드 4색(Coffee `#2D120D`, Rosewood `#6B0B0C`, Chiffon `#FFF8CA`, Botticelli `#CDE3E8`). 오렌지는 폐기했다
  - 폰트: Pretendard
  - 목업 3안 중 **A 절제안**을 골랐다. 이유는 가독성이다
- 목업: https://claude.ai/artifact/JWt3TnvjEoMmCygwfatuGc

**Why:** 이 리뉴얼은 M6 실사용 검증 전에 핵심 루프(리더와 블록 5종, 책 상세, 탐색 카드)를 다듬는 작업이다.

**단계 3 완료(2026-09-30, 커밋 `7b511b3`, 미푸시)**:
- `globals.css`: `@theme static`에 DESIGN.md 토큰을 넣었다. 타이포는 `--text-*--font-weight` 등의 하위 속성으로 묶었다. 역할별 `--font-*`는 `font-display` 클래스와 충돌해서 뺐다.
- Pretendard: npm `pretendard`의 dynamic subset CSS를 `layout.tsx`에서 import한다. `next/font/local` 대신 이 방식을 골랐다(단일 파일 2MB를 피하려고).
- `cn()`: `extendTailwindMerge`에 text 크기 토큰을 등록했다. 등록하지 않으면 `text-caption`이 `text-muted`와 충돌해 지워진다.
- 공용 표지는 `src/components/ui/book-cover.tsx`다. 개발용 검증 페이지는 `/dev/components`이고 프로덕션에서는 404다.
- 주의: Turbopack dev는 `globals.css` 수정을 놓친다. 수정 후 `rm -rf .next/dev`로 재시작한다.

**단계 4 완료(커밋 639fb30, 미푸시)**:
- 워크북 블록 5종: 공용 틀 `ui/workbook-block.tsx`. 상태 문구는 `lib/workbook/block-status.ts`에 있다. provider에 블록별 `blockSaves`(pending/savedAt)를 추가했다.
- "저장됨"은 이번 세션에서 저장에 성공한 경우에만 쓴다. 불러온 답은 "작성함"이다(캐시만 있는 답과 구분할 수 없기 때문).
- 리더 화면은 `components/reader/ReaderView.tsx`로 분리했다. 책 상세는 `BookDetailView.tsx`로 분리했다. 둘 다 `/dev/reader`(?mode=local|error|preview), `/dev/book`(?as=owner|preview), `/dev/explore`에서 목 데이터로 확인한다.
- `.reader-content`/`.prose` 규칙은 `@layer components`로 옮겼다. 밖에 두면 블록 유틸리티를 덮는다. `body`에는 `word-break: keep-all`을 넣었다.
- 나머지 라우트는 codemod로 gray→토큰 치환만 했다. `rounded-full` 알약 버튼·입력은 제거했다.
- **Supabase 새 프로젝트는 books가 0행**이다. 실제 데이터로 검증하려면 책을 발행해야 한다.
- 교훈: codemod의 구분 문자로 NUL을 쓰면 안 된다. `engagement.ts`와 `response-payload.ts`는 키 구분자로 NUL을 쓴다(되돌렸다).

**단계 5 진행(2026-10-01, 미커밋)**: 생성과 평가를 분리해 매 회차 새 평가 에이전트로 채점했다. 스크린샷 스크립트는 scratchpad의 `shoot.sh`·`states.mjs`이며 세션이 끝나면 사라진다.
- 3회차 점수(리더/책 상세/탐색): 구성 4/3/3, 타이포 4/4/3, 색 4/3/2, 정체성 3/3/2, 완성도 3/3/3, 기능 3/3/3
- 고친 것:
  - 헤더 회원가입은 secondary로 바꿨다. `/explore`에서는 헤더 검색을 숨긴다.
  - 책 상세의 관련 도서는 144px, 목차 오른쪽 끝을 메타 열에 맞췄다. 모바일에서는 주요 버튼이 한 줄 전체다.
  - 탐색은 데스크톱 4열. 인기 줄은 6칸이다. 검색은 위로 올렸고 검색 중에는 인기 줄을 숨긴다.
  - 미리보기 배너는 info 톤이다. SMART 라벨은 한글 우선(`term`/`question`)이다. 모바일 척도는 5×2다.
  - 저장 실패 표시 버그를 고쳤다. 체크리스트·척도가 실패를 가리던 문제다. `withSaveState`로 실패 우선, 성공 시 "· 저장됨"을 붙인다. 블록 안에 `BlockSaveError`와 재시도 버튼을 둔다.
- **사용자 결정(2026-10-01)**: dev 변형 토글로 실제 화면을 직접 보고 골랐다. DESIGN.md에만 반영했고 컴포넌트는 아직이다.
  - Callout: `line`(왼쪽 2px line-strong 세로선, 박스 없음)
  - 표지: `light`(chiffon/accent 글자, mark/primary, botticelli/primary). 짙은 면은 쓰지 않는다.
  - 결정 전에 dev 토글로 실제 화면을 보여 주는 방식을 사용자가 골랐다. 목업보다 실제 밀도를 보고 판단하길 원했다.
- **임시 코드(다음 세션에 정리)**: `src/components/ui/design-variants.tsx`(context)와 dev 페이지의 `?callout=`·`?cover=` 스위치, `WorkbookBlock`의 `variant` prop, `BookCover`의 `COVER_TONES` 변형 맵. 고른 모양을 기본값으로 박고 스위치를 지운다. `CalloutNodeView`(편집 뷰)에도 세로선을 적용한다.
- ③ accent 허용 범위(평가자 지적: 로즈우드 사용처 7곳)는 아직 결정하지 않았다.
- 남은 코드 작업 후보: 미리보기 목차에 열린 장·잠긴 장 표시, 척도·체크리스트 질문 필드(스키마 변경), 탐색 카드 메타(블록 수)

**How to apply:**
- 다음 세션: 임시 스위치를 걷어 내고 Callout·표지를 DESIGN.md대로 반영한다. 그다음 4~5회차 평가를 돌린다(최대 5회). 스크린샷·상태 캡처 스크립트는 다시 만들어야 한다(계획 문서의 "검증 방법" 참고). 계획은 `~/.claude/plans/zesty-kindling-moonbeam.md`에 있다.
- `.env.local`은 워크트리에 있다(2026-09-30 사용자 제공).
- 결정 전에는 선택지를 먼저 비교한다([[present-tradeoffs-before-recommending]]).
