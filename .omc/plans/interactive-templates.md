> **[SUPERSEDED — 2026-08-04]** 이 문서는 MVP 재구성 이전의 계획입니다.
> 인터랙티브 템플릿은 12종에서 **MVP 5종**(체크리스트, 콜아웃, 리플렉션, SMART, 스케일)으로 축소됐고,
> 나머지 7종은 삭제됐습니다. 독자 응답 저장 방식(localStorage 전용)도 M1~M3에서 DB 기반으로 재설계됩니다.
> 현행 계획은 `docs/agent-knowledge/mvp-rebuild-plan.md`, 진행 상황은 `TODO.md`를 보세요.
> 이 문서는 historical context로만 참고하세요.

# 인터랙티브 템플릿 12종 구현 계획 (v2 — Architect/Critic 피드백 반영)

**날짜:** 2026-04-16
**상태:** DRAFT — 사용자 확인 대기
**변경 이력:** v1 → v2: Critical 2건 + Major 3건 + 추가 보완 5건 반영

---

## RALPLAN-DR

### Principles (원칙)

1. **점진적 확장 (Incremental Extension):** 기존 TipTap + HtmlContentRenderer 아키텍처를 유지하면서 확장한다. 전면 재작성 금지.
2. **공통 인프라 우선 (Infrastructure First):** 12종 템플릿이 공유하는 기반(Base Node, sanitizer, localStorage 유틸, 리더기 교체 로직, 동적 높이 감지)을 먼저 구축한 뒤 개별 템플릿을 추가한다.
3. **에디터-리더기 분리 (Editor/Reader Separation):** 에디터 측은 TipTap Node + NodeView, 리더기 측은 독립 React 컴포넌트. 두 계층이 `data-*` HTML 속성으로만 통신한다.
4. **정적 폴백 선행 (Fallback Before Export):** EPUB/PDF 파이프라인에서 `template-fallback.ts`가 `toXhtml()`/`stripHtmlForPdf()` **이전에** 반드시 실행되어야 한다. EPUB에서 `<input>` 태그는 유효하지 않으므로 폴백이 선행해야 한다.
5. **사용자 상태 격리 (State Isolation):** localStorage 키를 `publedge_template_{chapterId}_{nodeId}`로 일관되게 관리하여 챕터 간 상태 충돌을 방지한다.

### Decision Drivers (의사결정 기준)

1. **보안 최우선:** sanitizer 확장 시 XSS 공격 벡터가 열리지 않아야 한다. `input type=checkbox`만 허용, 이벤트 핸들러(`onclick`, `onerror` 등) 일괄 금지.
2. **기존 코드 변경 최소화:** sanitize.ts, HtmlContentRenderer.tsx 수정은 불가피하지만, 기존 동작을 깨뜨리지 않아야 한다.
3. **구현 속도 vs 완성도 트레이드오프:** 1단계 8종을 빠르게 출시하고, 2단계 4종은 피드백 반영 후 구현한다.

### Viable Options

#### Option A: TipTap Custom Node + NodeView + html-react-parser 리더기 (선택)

에디터: TipTap `Node.create()` + `addNodeView()`로 구현.
리더기: `html-react-parser` (~8KB gzipped)로 HTML을 파싱하여 `data-template-type` 속성 감지 시 React 컴포넌트로 교체.

**Pros:**
- TipTap 공식 확장 패턴을 따르므로 에디터 기능(undo/redo, 복사/붙여넣기)과 자연 통합
- `html-react-parser`는 성숙한 라이브러리(주간 300만+ 다운로드), 번들 임팩트 ~8KB로 최소
- `dangerouslySetInnerHTML` 제거 가능 — React 컴포넌트 트리로 전환되므로 보안성 향상

**Cons:**
- 가드레일 "외부 라이브러리 추가 금지" 완화 필요 (아래 ADR에 근거 명시)
- `html-react-parser`의 `replace` 콜백 복잡도가 템플릿 종류에 비례

#### Option B: Read-only TipTap 인스턴스 리더기 (비채택)

리더기에서도 TipTap 에디터를 read-only 모드로 인스턴스화하여 NodeView를 재사용.

**Invalidation 근거:**
- TipTap + ProseMirror 번들 50-80KB 추가 — 리더기 초기 로드 성능 악화
- Read-only TipTap에서 인터랙티브 동작(체크, 입력)을 위해 NodeView를 다시 커스터마이징해야 하므로 공수 절감 효과 미미
- 리더기에 에디터 의존성을 도입하면 코드 결합도 증가

---

## Context (현재 상태)

| 영역 | 파일 | 현재 상태 |
|------|------|----------|
| 에디터 | `RichTextEditor.tsx` | extensions 배열에 StarterKit, SlashCommand 등 8개 확장 등록 |
| 슬래시 커맨드 | `extensions/SlashCommand.ts` | SLASH_ITEMS 배열에 9개 항목. Suggestion 기반 |
| 슬래시 메뉴 UI | `SlashCommandMenu.tsx` | forwardRef, 키보드 네비게이션 |
| 리더기 (메인) | `HtmlContentRenderer.tsx` | `sanitizeForRender(html)` 후 `dangerouslySetInnerHTML` |
| 리더기 (별도 경로) | `reader/[bookId]/page.tsx:152` | **별도의 `dangerouslySetInnerHTML`** — HtmlContentRenderer 미사용 |
| 리더기 컨테이너 | `ReaderContent.tsx` | HtmlContentRenderer에 chapter.content_html 전달 |
| 페이지네이터 | `useVirtualPaginator.ts` | CSS multi-column 기반, ResizeObserver로 컨테이너 리사이즈 감지 (자식 높이 변화 미감지) |
| Sanitizer (서버) | `lib/sanitize.ts:sanitizeContent()` | ALLOWED_TAGS에 section/details/summary/input/label/textarea **없음**, data-* 속성 **미허용** |
| Sanitizer (클라이언트) | `lib/sanitize.ts:sanitizeForRender()` | 동일한 ALLOWED_TAGS/ALLOWED_ATTR 사용 |
| API routes | `chapters/route.ts:97`, `chapters/[chapterId]/route.ts:93`, `upload/route.ts:75,83` | 모두 `sanitizeContent()` 호출 |
| EPUB | `lib/epub-generator.ts:276` | `toXhtml(chapter.content_html)` — 폴백 없이 직접 변환 |
| PDF | `lib/pdf-generator.tsx:367` | `stripHtmlForPdf(chapter.content_html)` — 폴백 없이 직접 변환 |

---

## Work Objectives (작업 목표)

1단계 완료 시: 에디터에서 슬래시 커맨드로 8종 인터랙티브 블록 삽입 가능, 리더기(양쪽 경로 모두)에서 인터랙티브 동작 및 localStorage 상태 저장, EPUB/PDF 정적 폴백 출력
2단계 완료 시: 나머지 4종 추가 (동일 패턴)

---

## Guardrails

### Must Have
- 기존 에디터 기능(제목, 인용문, 코드블록, 이미지 등) 정상 동작 유지
- sanitizer가 data-* 속성을 통과시키되, 이벤트 핸들러 속성은 일괄 금지
- `input` 태그는 `type=checkbox`만 허용 (서버 + 클라이언트 양쪽)
- 리더기에서 인터랙티브 컴포넌트가 테마(light/dark/sepia)에 대응
- EPUB/PDF 내보내기 시 정적 폴백이 의미 있는 콘텐츠 출력
- `reader/[bookId]/page.tsx`의 dangerouslySetInnerHTML도 동일한 렌더링 로직 적용
- useVirtualPaginator가 동적 높이 변화를 감지하여 재페이지네이션

### Must NOT Have
- 서버 사이드 상태 저장 (이 단계에서는 localStorage만 사용)
- 기존 에디터/리더기 컴포넌트의 구조적 재작성
- `onclick`, `onerror`, `onload`, `onmouseover` 등 이벤트 핸들러 속성 허용
- `input type=text`, `input type=password` 등 checkbox 이외의 input 허용 (서버 sanitizer에서)

### 가드레일 완화
- **"외부 라이브러리 추가 금지"** → `html-react-parser` 1건 예외 허용
- **근거:** (1) ~8KB gzipped로 번들 임팩트 최소 (2) 주간 300만+ 다운로드, 활발한 유지보수 (3) 대안(Read-only TipTap)은 50-80KB 추가 + 결합도 증가 (4) `dangerouslySetInnerHTML` 제거로 오히려 보안성 향상

---

## Task Flow (단계별 구현)

### Step 0: 공통 인프라 구축

**목표:** 12종 템플릿이 공유할 기반 코드를 모두 구축한다. sanitizer 확장, 리더기 파싱 교체, 페이지네이터 동적 높이 감지, nodeId 영속화 전략 포함.

#### 0-A: Sanitizer 확장 (서버 + 클라이언트)

**수정할 파일:** `src/lib/sanitize.ts`

**ALLOWED_TAGS 추가 (완전한 목록):**
```
기존: p, h1-h6, em, strong, ul, ol, li, blockquote, img, a, br, hr,
      table, thead, tbody, tr, th, td, pre, code, span, div, figure, figcaption
추가: section, details, summary, input, label, textarea
```

**ALLOWED_ATTR 추가 (완전한 목록):**
```
기존: href, src, alt, class, id
추가: type, name, for, open, min, max, value, placeholder, rows, cols, readonly, disabled
```

**DOMPurify 설정 변경:**
```typescript
// sanitizeContent() — 서버 사이드
export function sanitizeContent(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,                    // data-* 속성 일괄 허용
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover",
                  "onfocus", "onblur", "onchange", "onsubmit",
                  "onkeydown", "onkeyup", "onkeypress"],  // 이벤트 핸들러 일괄 금지
  });
}

// sanitizeForRender() — 클라이언트 사이드
export function sanitizeForRender(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover",
                  "onfocus", "onblur", "onchange", "onsubmit",
                  "onkeydown", "onkeyup", "onkeypress"],
  });
}
```

**추가 보안 조치 — input type 제한 (DOMPurify hook):**
```typescript
// DOMPurify afterSanitizeAttributes hook으로 input type=checkbox만 허용
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "INPUT" && node.getAttribute("type") !== "checkbox") {
    node.remove();
  }
});
```

#### 0-B: HtmlContentRenderer 파싱 교체

**의존성 추가:** `html-react-parser` (npm install)

**수정할 파일:** `src/components/reader/HtmlContentRenderer.tsx`

**변경 내용:**
- `dangerouslySetInnerHTML` 제거
- `html-react-parser`의 `parse(html, { replace })` 사용
- `replace` 콜백에서 `data-template-type` 속성 감지 시 `TemplateRenderer`로 교체
- `data-template-type`이 없는 일반 HTML은 그대로 통과 (기존 동작 유지)
- 미인식 `data-template-type` 값에 대한 폴백: 경고 로그 + 원본 HTML 그대로 렌더링

#### 0-C: 두 번째 리더 경로 통합 (Major 1 해결)

**수정할 파일:** `src/app/reader/[bookId]/page.tsx` (line 150-153)

**변경 내용:**
- `dangerouslySetInnerHTML={{ __html: currentChapter.content_html }}` 제거
- `HtmlContentRenderer` 컴포넌트 사용으로 교체
- 필요한 props(theme, fontSize, lineHeight) 전달 (해당 페이지에서 사용 가능한 값으로)

#### 0-D: useVirtualPaginator 동적 높이 감지 (Major 2 해결)

**수정할 파일:** `src/hooks/useVirtualPaginator.ts`

**변경 내용:**
- 기존 ResizeObserver는 **컨테이너** 리사이즈만 감지
- MutationObserver 추가: `{ childList: true, subtree: true, attributes: true }` — 자식 DOM 변화(토글 열기/닫기, textarea 입력 등) 감지
- mutation 발생 시 `recalculate()` 호출 (debounce 100ms 적용)
- 외부에서 강제 재계산을 트리거할 수 있는 `repaginate()` 콜백도 반환값에 추가

#### 0-E: nodeId 영속화 전략

**새로 생성할 파일:** `src/lib/template-node-id.ts`

**전략:**
- TipTap Node의 `id` 속성은 직렬화 시 불안정 (세션마다 재생성 가능)
- 대신 `data-node-id` 속성을 HTML에 직접 포함하여 영속화
- nodeId 생성: `crypto.randomUUID()` (브라우저) — Node 생성 시 1회 발급, 이후 HTML에 보존
- `BaseTemplateNode`의 `addAttributes()`에서 `data-node-id`를 필수 속성으로 정의
- `parseHTML`에서 기존 `data-node-id`를 읽어오고, 없으면 새로 생성

#### 0-F: 공통 파일 생성

**새로 생성할 파일:**
```
src/components/editor/extensions/templates/
  BaseTemplateNode.ts          — TipTap Node 생성 헬퍼 (공통 속성, renderHTML, parseHTML, data-node-id 자동 관리)
  index.ts                     — 모든 템플릿 Node를 re-export
src/components/reader/templates/
  TemplateRenderer.tsx          — data-template-type 기반 React 컴포넌트 디스패처 + 미인식 타입 폴백
  index.ts                     — 모든 리더기 템플릿 컴포넌트를 re-export
src/lib/template-storage.ts    — localStorage 유틸 (get/set/clear, 키: publedge_template_{chapterId}_{nodeId})
src/lib/template-node-id.ts   — nodeId 생성/복원 유틸
```

**수정할 파일:**
```
src/lib/sanitize.ts                                    — 0-A
src/components/reader/HtmlContentRenderer.tsx           — 0-B
src/app/reader/[bookId]/page.tsx                        — 0-C
src/hooks/useVirtualPaginator.ts                        — 0-D
src/components/editor/extensions/SlashCommand.ts        — 템플릿 카테고리 구분자 + 8개 항목 추가
src/components/editor/SlashCommandMenu.tsx              — 카테고리 헤더 UI 지원
src/components/editor/RichTextEditor.tsx                — extensions 배열에 템플릿 Node들 등록
```

**Acceptance Criteria:**
- [ ] `sanitizeContent()`가 `<section data-template-type="test" data-node-id="abc123">` 을 보존함
- [ ] `sanitizeContent()`가 `<input type="text">` 을 제거하고 `<input type="checkbox">` 은 보존함
- [ ] `sanitizeContent()`가 `<div onclick="alert(1)">` 의 onclick을 제거함
- [ ] `sanitizeForRender()`도 동일한 보안 규칙 적용
- [ ] `HtmlContentRenderer`가 `data-template-type` 있는 요소를 React 컴포넌트로 교체함
- [ ] `HtmlContentRenderer`가 미인식 `data-template-type="unknown"` 에 대해 원본 HTML을 그대로 렌더링함
- [ ] `reader/[bookId]/page.tsx`에서 `dangerouslySetInnerHTML` 제거, `HtmlContentRenderer` 사용
- [ ] `useVirtualPaginator`가 자식 DOM 변화(details 열기 등) 시 자동 재페이지네이션
- [ ] `BaseTemplateNode`로 만든 더미 템플릿 Node가 에디터에 삽입/렌더링됨
- [ ] nodeId가 저장-로드 왕복 후에도 보존됨
- [ ] 기존 에디터 기능(제목, 인용문, 코드블록 등)이 깨지지 않음
- [ ] 기존 콘텐츠(data-template-type 없는 HTML)가 리더기에서 동일하게 렌더링됨

---

### Step 1: 1단계 템플릿 8종 — 에디터 Node + NodeView 구현

**목표:** 8종 각각의 TipTap Node 정의 + 에디터 내 NodeView React 컴포넌트 구현

**새로 생성할 파일 (각 템플릿마다 2파일):**
```
src/components/editor/extensions/templates/
  ChecklistNode.ts + ChecklistNodeView.tsx
  CalloutNode.ts + CalloutNodeView.tsx
  ReflectionNode.ts + ReflectionNodeView.tsx
  ToggleNode.ts + ToggleNodeView.tsx
  ColumnListNode.ts + ColumnListNodeView.tsx
  SmartGoalNode.ts + SmartGoalNodeView.tsx
  BeforeAfterNode.ts + BeforeAfterNodeView.tsx
  ScaleNode.ts + ScaleNodeView.tsx
```

**각 템플릿 구현 요점:**

| 템플릿 | HTML 구조 | 에디터 NodeView 핵심 | data 속성 |
|--------|----------|---------------------|-----------|
| 체크리스트 | `section > label+input[checkbox]` | 항목 추가/삭제/체크 토글 | `data-template-type="checklist"`, `data-node-id` |
| 콜아웃 | `section > .icon + .content` | 아이콘 선택(info/warning/tip/note), 텍스트 편집 | `data-template-type="callout"`, `data-callout-type`, `data-node-id` |
| 리플렉션 프롬프트 | `section > .prompt + textarea` | 질문 텍스트 편집, 응답 영역 표시 | `data-template-type="reflection"`, `data-node-id` |
| 토글/접기 | `details > summary + .content` | 제목 편집, 내부 콘텐츠 편집 | `data-template-type="toggle"`, `data-node-id` |
| N열 리스트 | `section > .column*N` | 열 수 조절(2-4), 각 열 내용 편집 | `data-template-type="column-list"`, `data-columns`, `data-node-id` |
| SMART 목표 | `section > .field*5` | S/M/A/R/T 각 필드 편집 | `data-template-type="smart-goal"`, `data-node-id` |
| Before/After | `section > .before + .after` | Before/After 각 영역 편집 | `data-template-type="before-after"`, `data-node-id` |
| 1-10 스케일 | `section > .scale + .label` | 스케일 값 설정(기본값), 라벨 편집 | `data-template-type="scale"`, `data-min`, `data-max`, `data-node-id` |

**Acceptance Criteria:**
- [ ] 슬래시 커맨드 `/`에서 "인터랙티브" 카테고리 아래 8종 항목이 표시됨
- [ ] 각 템플릿 삽입 시 에디터 내에서 편집 가능한 NodeView가 렌더링됨
- [ ] 에디터에서 작성한 내용이 HTML로 직렬화 시 올바른 `data-*` 속성 + `data-node-id` 포함
- [ ] Undo/Redo가 정상 동작
- [ ] 저장 후 다시 열었을 때 NodeView가 정상 복원 (data-node-id 보존)

---

### Step 2: 1단계 템플릿 8종 — 리더기 인터랙티브 컴포넌트

**목표:** 리더기에서 8종 각각을 인터랙티브 React 컴포넌트로 렌더링 + localStorage 상태 관리

**새로 생성할 파일:**
```
src/components/reader/templates/
  ChecklistReader.tsx
  CalloutReader.tsx
  ReflectionReader.tsx
  ToggleReader.tsx
  ColumnListReader.tsx
  SmartGoalReader.tsx
  BeforeAfterReader.tsx
  ScaleReader.tsx
```

**각 리더기 컴포넌트 핵심:**

| 템플릿 | 인터랙티브 동작 | 저장 상태 | 높이 변화 여부 |
|--------|----------------|----------|--------------|
| 체크리스트 | 항목 체크/해제 | 체크 상태 배열 | No |
| 콜아웃 | 없음 (정적 표시) | -- | No |
| 리플렉션 프롬프트 | textarea 입력 | 응답 텍스트 | **Yes** — textarea auto-resize |
| 토글/접기 | 클릭으로 열기/닫기 | 열림 상태 | **Yes** — details open/close |
| N열 리스트 | 없음 (정적 표시) | -- | No |
| SMART 목표 | 각 필드 입력 | 5개 필드 값 | **Yes** — textarea auto-resize |
| Before/After | 각 영역 입력 | before/after 텍스트 | **Yes** — textarea auto-resize |
| 1-10 스케일 | 슬라이더/버튼 선택 | 선택 값 | No |

**높이 변화 컴포넌트:** 리플렉션, 토글, SMART 목표, Before/After — 이들은 상태 변화 시 Step 0-D의 `repaginate()` 콜백을 호출해야 함.

**Acceptance Criteria:**
- [ ] 리더기에서 8종 인터랙티브 컴포넌트가 정상 렌더링
- [ ] 테마(light/dark/sepia) 전환 시 스타일 대응
- [ ] localStorage에 상태 저장/복원 동작 확인
- [ ] 높이 변화 컴포넌트(토글, 리플렉션 등)가 useVirtualPaginator와 연동되어 페이지 재계산
- [ ] `data-template-type`이 없는 기존 콘텐츠는 기존과 동일하게 렌더링
- [ ] `reader/[bookId]/page.tsx` 경로에서도 동일하게 동작

---

### Step 3: EPUB/PDF 정적 폴백

**목표:** 내보내기 시 인터랙티브 블록을 의미 있는 정적 콘텐츠로 변환. **반드시 toXhtml/stripHtmlForPdf 이전에 실행.**

**새로 생성할 파일:**
```
src/lib/template-fallback.ts   — HTML을 정적 폴백 HTML로 변환하는 유틸
```

**수정할 파일 + 구체적 삽입 지점:**
```
src/lib/epub-generator.ts
  — line 276: chapterXhtml() 함수 내
  — 변경 전: const body = toXhtml(chapter.content_html || ...);
  — 변경 후: const body = toXhtml(applyTemplateFallback(chapter.content_html || ...));
  — applyTemplateFallback()이 toXhtml() 이전에 실행되어야 함
  — 이유: EPUB XHTML에서 <input>, <textarea>, <details> 태그가 유효하지 않음

src/lib/pdf-generator.tsx
  — line 367: ChapterPage() 함수 내
  — 변경 전: const blocks = stripHtmlForPdf(chapter.content_html || ...);
  — 변경 후: const blocks = stripHtmlForPdf(applyTemplateFallback(chapter.content_html || ...));
  — applyTemplateFallback()이 stripHtmlForPdf() 이전에 실행되어야 함
  — 이유: stripHtmlForPdf()는 텍스트 추출만 하므로 템플릿 구조 정보가 소실됨
```

**폴백 전략:**

| 템플릿 | 정적 폴백 | EPUB-safe 여부 |
|--------|----------|---------------|
| 체크리스트 | 체크박스 유니코드(☐/☑) 리스트 | Yes (순수 텍스트) |
| 콜아웃 | 아이콘 + 인용문 스타일 박스 (`<blockquote>`) | Yes |
| 리플렉션 프롬프트 | 질문 텍스트 + "여기에 답변을 작성하세요" 플레이스홀더 | Yes |
| 토글/접기 | 펼친 상태로 모든 내용 표시 (`<div>`) | Yes |
| N열 리스트 | 단일 열 리스트로 폴백 | Yes |
| SMART 목표 | 라벨+빈칸 테이블 (`<table>`) | Yes |
| Before/After | 두 섹션 순차 표시 | Yes |
| 1-10 스케일 | 스케일 라벨 + 텍스트 표시 | Yes |

**미인식 template-type 폴백:** `applyTemplateFallback()`에서 알 수 없는 `data-template-type` 값을 만나면, `data-*` 속성만 제거하고 내부 HTML은 그대로 보존 (정보 손실 최소화).

**Acceptance Criteria:**
- [ ] EPUB 내보내기 시 인터랙티브 블록이 정적 HTML로 변환되어 포함
- [ ] PDF 내보내기 시 인터랙티브 블록이 정적 레이아웃으로 포함
- [ ] EPUB XHTML에 `<input>`, `<textarea>`, `<details>` 태그가 남아있지 않음
- [ ] 폴백 콘텐츠가 원본의 의미를 보존
- [ ] 미인식 template-type이 에러 없이 처리됨

---

### Step 4: 2단계 템플릿 4종 추가

**목표:** 1단계와 동일한 패턴으로 4종 추가

**새로 생성할 파일:**
```
src/components/editor/extensions/templates/
  QuadrantNode.ts + QuadrantNodeView.tsx
  OkrNode.ts + OkrNodeView.tsx
  HabitTrackerNode.ts + HabitTrackerNodeView.tsx
  WoopNode.ts + WoopNodeView.tsx

src/components/reader/templates/
  QuadrantReader.tsx
  OkrReader.tsx
  HabitTrackerReader.tsx
  WoopReader.tsx
```

**각 템플릿 구현 요점:**

| 템플릿 | 에디터 NodeView | 리더기 인터랙션 | 저장 상태 |
|--------|----------------|----------------|----------|
| 2x2 사분면 | 4칸 그리드, 축 라벨 편집 | 각 칸 입력 | 4칸 텍스트 |
| OKR | Objective + Key Results(추가/삭제) | 진행률 입력 | 진행률 배열 |
| 습관 추적 | 습관 목록 + 7일 그리드 | 날짜별 체크 | 체크 매트릭스 |
| WOOP | W/O/O/P 4필드 | 각 필드 입력 | 4필드 텍스트 |

**Acceptance Criteria:**
- [ ] 4종 슬래시 커맨드 추가, 에디터 NodeView 동작
- [ ] 리더기 인터랙티브 컴포넌트 동작 + localStorage 상태 관리
- [ ] EPUB/PDF 정적 폴백 포함
- [ ] `template-fallback.ts`에 4종 폴백 로직 추가

---

### Step 5: 통합 검증 + 보안 분석 + 테스트

**목표:** 전체 12종이 에디터-저장-로드-리더기-내보내기 파이프라인에서 정상 동작. 보안 회귀 없음.

**검증 항목:**
- [ ] 에디터에서 12종 삽입 -> 저장 -> DB 저장 -> 로드 -> 에디터 재렌더링 (HTML 왕복 무손실, data-node-id 보존)
- [ ] 에디터에서 12종 삽입 -> 리더기(HtmlContentRenderer 경로)에서 인터랙티브 동작
- [ ] 에디터에서 12종 삽입 -> 리더기(reader/[bookId] 경로)에서 인터랙티브 동작
- [ ] 리더기 상태가 챕터 전환 후에도 localStorage에서 복원
- [ ] EPUB/PDF 내보내기 정적 폴백 확인 (EPUB에 금지 태그 없음)
- [ ] 빈 템플릿(내용 미입력) 상태에서의 렌더링 안정성
- [ ] 복수 템플릿이 한 챕터에 혼합된 경우 정상 동작
- [ ] 토글 열기/닫기, textarea 입력 시 페이지네이션 재계산

**보안 분석:**
- [ ] `<section data-template-type="checklist" onclick="alert(1)">` → onclick 제거 확인
- [ ] `<input type="text" data-template-type="test">` → input 제거 확인 (type=checkbox만 허용)
- [ ] `<img src=x onerror="alert(1)">` → onerror 제거 확인 (기존 동작 유지)
- [ ] `<textarea onfocus="alert(1)">` → onfocus 제거 확인
- [ ] `<section data-template-type="checklist"><script>alert(1)</script>` → script 제거 확인

**핵심 파이프라인 테스트 (최소 범위):**
- [ ] `sanitize.ts` 단위 테스트: 허용 태그/속성 보존 + 금지 속성 제거 + input type 제한
- [ ] `template-fallback.ts` 단위 테스트: 각 template-type → 정적 HTML 변환 + 미인식 타입 폴백
- [ ] `template-storage.ts` 단위 테스트: get/set/clear + 키 생성 규칙
- [ ] `HtmlContentRenderer` 통합 테스트: template-type 있는 HTML → React 컴포넌트 렌더링 + 없는 HTML → 기존 동작

---

## 파일 변경 요약

### 새로 생성 (약 32개 파일)
```
src/components/editor/extensions/templates/   — 12종 x 2파일 + BaseTemplateNode.ts + index.ts = 26파일
src/components/reader/templates/              — 12종 + TemplateRenderer.tsx + index.ts = 14파일
src/lib/template-storage.ts                   — 1파일
src/lib/template-fallback.ts                  — 1파일
src/lib/template-node-id.ts                   — 1파일
```

### 수정 (8개 파일)
```
src/lib/sanitize.ts                                     — sanitizer 확장 (0-A)
src/components/reader/HtmlContentRenderer.tsx            — html-react-parser 도입 (0-B)
src/app/reader/[bookId]/page.tsx                         — dangerouslySetInnerHTML 제거, HtmlContentRenderer 사용 (0-C)
src/hooks/useVirtualPaginator.ts                         — MutationObserver + repaginate 추가 (0-D)
src/components/editor/extensions/SlashCommand.ts         — 템플릿 카테고리 + 항목 추가
src/components/editor/SlashCommandMenu.tsx               — 카테고리 헤더 UI
src/components/editor/RichTextEditor.tsx                 — extensions 배열 확장
src/lib/epub-generator.ts                               — applyTemplateFallback() 삽입 (line 276)
src/lib/pdf-generator.tsx                                — applyTemplateFallback() 삽입 (line 367)
```

### 의존성 추가 (1건)
```
html-react-parser — ~8KB gzipped, npm install html-react-parser
```

---

## Success Criteria (최종 성공 기준)

1. 에디터에서 `/` 입력 시 "인터랙티브" 카테고리에 12종 템플릿이 표시되고 삽입 가능
2. 에디터 내 NodeView에서 각 템플릿의 콘텐츠 편집 가능
3. 저장 후 다시 열었을 때 템플릿 구조와 콘텐츠가 보존됨 (data-node-id 포함)
4. 리더기 **양쪽 경로 모두**에서 인터랙티브 동작(체크, 입력, 토글, 슬라이더 등) 정상
5. 리더기 상태가 localStorage에 저장/복원됨
6. 토글 열기/닫기 등 동적 높이 변화 시 페이지네이션 자동 재계산
7. EPUB/PDF 내보내기에서 정적 폴백 출력 (EPUB에 금지 태그 없음)
8. sanitizer 확장으로 인한 XSS 취약점 없음 (보안 테스트 통과)
9. 기존 에디터/리더기 기능에 회귀 없음
10. 핵심 파이프라인 단위 테스트 존재

---

## ADR (Architecture Decision Record)

### Decision
TipTap Custom Node + NodeView 패턴 (에디터) + `html-react-parser` 기반 컴포넌트 디스패치 (리더기)로 12종 인터랙티브 템플릿 구현

### Drivers
1. 기존 TipTap HTML 에디터 아키텍처와의 자연스러운 통합
2. 리더기 번들 사이즈 최소화 (~8KB vs 50-80KB)
3. `dangerouslySetInnerHTML` 제거를 통한 보안성 향상
4. 유지보수성 (일관된 Node 패턴 + React 컴포넌트 트리)

### Alternatives considered
1. **Read-only TipTap 인스턴스 리더기** — TipTap+ProseMirror 번들 50-80KB 추가, 리더기-에디터 결합도 증가, read-only에서 인터랙티브 동작을 위한 추가 커스터마이징 필요로 비채택
2. **Markdown 커스텀 블록 방식** — Markdown 파이프라인 부재로 공수 2-3배 증가, 기존 HTML 콘텐츠 호환성 문제로 비채택

### Why chosen
- `html-react-parser`는 성숙도(주간 300만+ 다운로드)와 번들 사이즈(~8KB)에서 최적
- `dangerouslySetInnerHTML` → React 컴포넌트 트리 전환으로 보안성과 테스트 용이성 동시 확보
- TipTap NodeView 패턴은 에디터 측에서 공식 지원하는 방식이므로 undo/redo, 직렬화 등 자동 처리

### Consequences
- **파일 수 증가** (약 43개 신규) — BaseTemplateNode 헬퍼로 보일러플레이트 최소화
- **외부 의존성 1건 추가** (`html-react-parser`) — 가드레일 예외 허용 필요
- **sanitizer 확장** — 허용 태그/속성 증가로 공격 표면 확대 → DOMPurify hook으로 input type 제한, 이벤트 핸들러 일괄 금지로 완화
- **두 리더 경로 통합** — `reader/[bookId]/page.tsx` 수정 → 기존 기능 회귀 테스트 필요

### Follow-ups
- 2단계 구현 후 사용자 피드백 기반으로 3단계 템플릿 확장 검토
- 서버 사이드 상태 저장(사용자 계정 연동) 별도 검토
- 템플릿별 분석 데이터(사용 빈도, 완료율) 수집 검토
- `html-react-parser` 의존성의 보안 업데이트 모니터링 프로세스 수립
