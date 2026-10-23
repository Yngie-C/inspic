# 9단계 리뷰 결과 — 독자 응답·쪽 넘김 리더

- 날짜: 2026-10-22
- 실행 (경로마다 따로, 워크트리 `orca/workspaces/inspic/code-review-2`):
  ```
  /code-review high src/components/reader/WorkbookResponsesProvider.tsx
  /code-review high src/components/reader/paged
  /code-review high src/components/reader/ReaderView.tsx
  /code-review high src/components/reader/templates
  /code-review high src/components/reader/SaveStatusBadge.tsx src/components/reader/reader-links.ts
  ```
- 대상 커밋: `ab6ba02` (다섯 경로 모두 브랜치 diff가 없어 파일 전체를 검토)
- 원 지적 45건(provider 10 · paged 10 · ReaderView 8 · templates 10 · 배지·링크 7). 경로가 겹쳐 같은 원인이 두 번 나온 4건을 합쳐 **41건 (P0 2 · P1 22 · P2 17)**.
  - 같은 장 다시 고르기(paged 1 · ReaderView 1), DOM 재사용(paged 3 · ReaderView 3), 시트의 disabled 포커스(paged 6 · templates 3), 로그인 뒤 1장(templates 4 · reader-links 4).
- **검증 상태**
  - 직접 대조함: P0-1(`sendPending` 묶음 반복문에 `isCurrent` 검사 없음), P1-4(`startAt`이 측정을 걸지 않음), P1-6(`anchorOn`의 `>=`), P1-17(`||`), P1-19(`FIRST_FIELD`), P2-7(`loginHref` 문자열 연결)은 코드와 위치를 확인했어요.
  - 나머지는 리뷰 출력 그대로이고, 테스트·앱 확인은 하지 않았어요.

계획은 [code-review-plan.md](../code-review-plan.md), 이전 결과는 [07-read-analytics.md](07-read-analytics.md)를 보세요.

## 공통 원인 세 가지

1. **세션이 바뀌거나 불러오기가 끝나는 경계에서 큐를 다시 보지 않는다.** 보낼 목록을 복사해 둔 반복문, 불러오기 중에 쌓인 큐, 이전 세션의 `cache` 상태가 경계를 넘어 살아남아요. 결과는 남의 계정에 답이 쓰이거나(P0-1), 화면과 DB가 다른 값을 들고 "저장됨"을 보이는 것(P0-2)이에요.
2. **쪽 상태(`pageRef`·`totalRef`·`anchorRef`)를 측정 없이 바꾸거나, 측정 결과를 믿을 수 없는 요소에 기댄다.** 같은 장 다시 고르기, 측정 전 넘김, 인덱스 key로 재사용된 DOM, 다음 쪽 요소를 기준으로 잡는 `anchorOn`이 모두 "쪽·장을 건너뛴다"로 나타나요.
3. **같은 판정·문구를 화면마다 따로 둔다.** 잠금 문구(`LOCK_LINE`), 척도 판정·라벨(`card-summary`), 저장 상태 변환(`withSaveState`), 본문 렌더러(`PagedContentRenderer`)가 두 벌이에요. 이미 문구가 갈렸고(P2-12) 판정도 갈렸어요(P1-16).

## P0

| # | 위치 | 지적 |
|---|---|---|
| P0-1 | `WorkbookResponsesProvider.tsx:320` | `sendPending`이 큐를 복사해 묶음으로 보내면서 묶음 사이에 `isCurrent(session)`을 보지 않음 → 200건·1MB(keepalive 60KB)를 넘어 묶음이 나뉜 상태에서 A가 B로 계정을 바꾸면 남은 묶음이 B의 쿠키로 나가 **A의 답이 B의 행으로 저장됨**. AGENTS.md "계정·책이 바뀌면 이전 큐를 보내지 않고" 위반. |
| P0-2 | `WorkbookResponsesProvider.tsx:537` | `hydrate`가 `merged.resend`를 큐에 더하기만 함 → 불러오는 중에 쓴 답이 병합에서 서버 값에 져도 큐에 남아 전송됨. 화면은 서버 값으로 "저장됨", DB는 기기 값. 다시 열면 기기 값이 나타남. |

## P1

| # | 위치 | 지적 |
|---|---|---|
| P1-1 | `WorkbookResponsesProvider.tsx:385` | 불러오기 실패 뒤 새 답 하나가 저장되면 `LOAD_ERROR`가 지워지고 "저장됨" → 다시 시도 버튼이 사라지고, 캐시의 미전송 답은 그 세션에서 끝내 안 나감. 표시 없는 캐시 값도 저장된 것처럼 보임. |
| P1-2 | `WorkbookResponsesProvider.tsx:673` | 거절된 답을 다시 보내 또 거절되면 `written_at`을 `Date.now()`로 바꿈 → 다른 기기에서 그 사이 쓴 더 새 서버 값을 다음 불러오기에서 옛 로컬 값이 이김. |
| P1-3 | `WorkbookResponsesProvider.tsx:735` | `viewerId`가 바뀐 첫 렌더가 이전 세션의 `cache`로 그림 → 공용 기기에서 A의 답이 B의 쓸 수 있는 칸에 잠깐 보임. 그 사이 입력하면 칸 값이 튐. |
| P1-4 | `paged/usePagedColumns.ts:157`, `ReaderView.tsx:114` | 목차에서 지금 장을 다시 고르면 `startAt`이 `pageRef=0`·`totalRef=1`로 바꾸지만 `contentKey`가 그대로라 측정이 안 돎 → 화면은 5/12쪽인데 다음 넘김이 다음 장으로 가서 6~12쪽을 건너뜀. 이전도 앞 장 끝으로. |
| P1-5 | `ReaderView.tsx:104` | 장을 바꾼 뒤 측정 프레임 전에 또 넘기면 새 장을 1쪽짜리로 보고 다음 장으로 감 → → 키를 빨리 두 번 누르면 장 하나를 통째로 건너뜀. |
| P1-6 | `paged/usePagedColumns.ts:76` | `anchorOn`이 `pageOf(node) >= target`인 첫 요소를 잡음 → 긴 문단·목록이 쪽 전체를 차지하면 뒤 쪽 요소가 기준이 되고, 주소창 접힘·이미지 로드·폰트 로드로 다시 재면 그 쪽으로 이동해 2쪽을 건너뜀. 주석("한 문단 안이면 null")과 반대. |
| P1-7 | `paged/usePagedColumns.ts:169`, `ReaderView.tsx:243` | 본문 래퍼에 장별 `key`가 없어 html-react-parser의 인덱스 key로 DOM이 재사용됨 → 보던 장이 목록에서 빠져 이웃 장으로 바뀔 때 옛 기준 요소가 `isConnected`라 첫 쪽이 아니라 중간에서 열림. |
| P1-8 | `paged/usePagedColumns.ts:101` | 쪽 폭·이동 거리를 정수로 반올림된 `clientWidth`로 정함 → 확대·소수 폭에서 쪽마다 오차가 쌓여 50쪽쯤에서 본문 오른쪽이 잘리고 앞 단이 비침. `getBoundingClientRect().width`로. |
| P1-9 | `paged/usePagedColumns.ts:204` | 키로 쪽을 넘겨도 포커스가 이전 쪽 카드 버튼에 남음 → 다음 Tab이 `focusin`으로 이전 쪽으로 되돌리고, Enter는 보이지 않는 카드의 시트를 엶. |
| P1-10 | `paged/paged.css:13` | 표에 폭 제한·스크롤이 없음(`pre`에만 있음) → DOCX에서 온 넓은 표가 다음 단 위에 겹치고 `scrollWidth`를 늘려 빈 쪽이 생김. |
| P1-11 | `SaveStatusBadge.tsx:43` | 실패 이유·해결 방법이 `title`에만 있음 → 모바일·스크린 리더에서 "다시 로그인해 주세요. 답은 이 기기에 남아 있어요"가 안 보임. DESIGN.md "danger는 오류 문장과 함께" 위반. |
| P1-12 | `SaveStatusBadge.tsx:41` | 401/403 실패에도 동작은 "다시 시도"뿐 → 눌러도 또 401, 로그인으로 가는 길이 없음. |
| P1-13 | `SaveStatusBadge.tsx:46` | 불러오기 실패에도 "저장 실패" 문구 → 아무것도 안 쓴 독자가 답이 날아간 줄 앎. 이때 동작은 다시 불러오기. |
| P1-14 | `reader-links.ts:3`, `templates/BlockLockNotice.tsx:28` | 로그인 뒤 `/reader/{id}`로만 돌아옴 → 장 위치가 URL에 없어 늘 1장. "여기에 바로 쓸 수 있어요"와 어긋남. |
| P1-15 | `templates/BlockLockNotice.tsx:26` | "로그인"/"구매" 안내를 클라이언트 `signedIn`으로 고름. 저장을 막은 이유는 서버의 `canSaveResponses` → 쿠키 세션만 만료되면 산 독자·무료 책 독자에게 "구매하면 쓸 수 있어요"가 뜸. |
| P1-16 | `paged/card-summary.ts:86` | 범위 밖 척도 답이면 `preview`가 null → 카드 한 장에 "예전 답 3 · 다시 골라 주세요"와 "아직 쓰지 않았어요."·[작성하기]가 함께 뜸. 진행률은 답함으로 셈. |
| P1-17 | `templates/ReflectionReader.tsx:28` | `data-placeholder`를 `||`로 읽어 저자가 비운 문구를 기본 문구로 되살림. AGENTS.md "없을 때만 기본값(`??`)" 위반. |
| P1-18 | `templates/useAutoResize.ts:38` | 높이를 잠깐 `auto`로 줄일 때 스크롤 부모(시트 패널)의 `scrollTop`이 잘리고 안 돌아옴 → 시트에서 긴 답 아래쪽을 고치면 키마다 화면이 튐. |
| P1-19 | `paged/BlockSheet.tsx:15` | `FIRST_FIELD`의 `button[aria-pressed]`가 disabled를 빼지 않음 → 잠긴 척도 시트에서 `focus()`가 무시돼 포커스가 모달 밖에 남음. 쓸 수 있을 때도 선택된 칸이 아니라 늘 첫 칸. |
| P1-20 | `SaveStatusBadge.tsx:38` | `aria-live`/`role="status"` 없음 → 스크린 리더에 "저장 실패"가 안 읽힘. |
| P1-21 | `ReaderView.tsx:136` | 탭 영역을 `<main>` 폭의 20%로 잡음 → 데스크톱에서 본문 앞 240px 클릭이 이전 쪽, 다음 쪽 영역은 대부분 빈 여백. `clipRef` 기준으로. |
| P1-22 | `ReaderView.tsx:122` | 모바일 목차를 연 채 601px 이상으로 넓히면 오버레이는 숨지만 `tocOpen`이 남아 쪽 넘김 키가 전부 막힘. |

## P2

| # | 위치 | 지적 |
|---|---|---|
| P2-1 | `WorkbookResponsesProvider.tsx:355` | 401/403에 `continue` → 거절이 확정된 세션에서 남은 묶음을 다 보냄. keepalive 할당량도 씀. `break`. |
| P2-2 | `WorkbookResponsesProvider.tsx:502` | 세션 변경·다시 불러오기 때 `saveState`를 `loading`으로 돌리지 않음 → 다시 시도 뒤에도 "저장 실패"가 이유 없이 남고, 책 Y가 불러오기 전부터 "저장됨". |
| P2-3 | `WorkbookResponsesProvider.tsx:229` | 키마다 책 전체 캐시를 직렬화해 `localStorage`에 동기로 씀 → 긴 답이 많으면 모바일 입력이 끊김. |
| P2-4 | `WorkbookResponsesProvider.tsx:417` | `rerun`이 걸린 채 네트워크 오류가 나면 대기 없이 같은 큐를 곧바로 다시 보냄. |
| P2-5 | `WorkbookResponsesProvider.tsx:346` | "값이 그대로일 때만 큐에서 뺀다"가 두 벌(settle · denied), provider 없음 검사가 훅 세 곳. |
| P2-6 | `SaveStatusBadge.tsx:16` | `loading` 동안 배지가 null인데 입력은 받음 → 불러오기 전에 쓰고 닫으면 안 나간 것을 알 수 없음. |
| P2-7 | `reader-links.ts:3` | `redirect`를 인코딩 없이 이어 붙이고 `withRedirect()`(`lib/safe-redirect.ts`)를 다시 구현. |
| P2-8 | `ReaderView.tsx:121` | `keydown`이 `defaultPrevented`·스크롤 영역을 보지 않음 → 목차·넓은 표·`pre` 안에서 PageDown·화살표가 쪽을 넘김. |
| P2-9 | `ReaderView.tsx:84` | `isPreview ||`가 다음 장만 막음. 운영에서는 장이 하나라 무해, `/dev/reader?mode=preview`에서 앞뒤가 어긋남. |
| P2-10 | `ReaderView.tsx:120` | `turn`·`sheet` 의존으로 장 이동·시트·목차·refetch마다 window 리스너를 다시 붙임. ref + 한 번 등록으로. |
| P2-11 | `templates/ScaleReader.tsx:55` | 척도·체크리스트는 잠긴 상태에서도 "작성 전"·"3개 중 0개"를 보임(성찰·목표는 `canWrite`일 때만). |
| P2-12 | `paged/BlockCard.tsx:13` | `LOCK_LINE`이 `BlockLockNotice`와 별도 문구 → 이미 "여기에 쓸 수 있어요"/"여기에 바로 쓸 수 있어요"로 갈림. |
| P2-13 | `paged/PagedContentRenderer.tsx:24` | `HtmlContentRenderer`의 sanitize → parse → replace를 통째로 복사 → 한쪽만 고치면 지금 화면(쪽 넘김)에 반영 안 됨. |
| P2-14 | `paged/card-summary.ts:73` | 척도 범위·`describeScale`·체크리스트 완료 수·블록 라벨을 템플릿과 따로 구현. P1-16의 원인. |
| P2-15 | `templates/ChecklistReader.tsx:31` | `withSaveState(...)` 변환이 Checklist·Scale·BlockCard 세 곳, `BlockLockNotice`+`BlockSaveError` 꼬리가 네 템플릿에 반복. |
| P2-16 | `templates/ChecklistReader.tsx:24` | 렌더마다 `data-items`를 `JSON.parse`, 키마다 context 값이 바뀌어 모든 템플릿·카드가 다시 렌더. |
| P2-17 | `templates/useBlockAnswers.ts:60` | `useSaveStatus`가 블록마다 30초 `setInterval`, 결과를 버리는 체크리스트·척도 카드에서도 호출. |

## 수정 묶음 제안

묶음 이름은 다른 단계와 구분하려고 `9-`를 붙여요. 순서는 9-A → 9-B → 9-C → 9-D이고, 다른 단계 묶음과의 순서는 [code-review-plan.md](../code-review-plan.md) 2차 절의 "수정 순서"를 따라요. 한 묶음 = 한 PR.

| 묶음 | 지적 | 비고 |
|---|---|---|
| 9-A. 응답 큐와 세션 경계 | P0-1, P0-2, P1-1~3, P2-1, P2-2, P2-4, P2-5 | 남의 계정에 답이 쓰이는 P0-1이 이번 단계에서 가장 급함. 모두 `WorkbookResponsesProvider.tsx` 한 파일. |
| 9-B. 쪽 위치 | P1-4~10, P1-21, P1-22, P2-8~10 | `usePagedColumns.ts`·`ReaderView.tsx`·`paged.css`. 장·쪽 건너뛰기 네 건(P1-4~7)이 핵심. |
| 9-C. 저장·잠금 안내와 시트 | P1-11~20, P2-6, P2-7, P2-11, P2-12, P2-14, P2-15 | `SaveStatusBadge`·`BlockLockNotice`·`BlockCard`·`reader-links`·`BlockSheet`·`card-summary`·`ReflectionReader`·`useAutoResize`. P1-14·P1-15는 결정이 필요(아래). P2-12·P2-15(`BlockLockNotice` 문구·꼬리)와 P2-14(`card-summary`, P1-16의 원인)는 같은 파일을 두 번 만지지 않도록 D에서 옮겨 왔어요. |
| 9-D. 한 벌로 모으기와 렌더 비용 | P2-3, P2-13, P2-16, P2-17 | 동작 변화 없는 정리. P2-3은 결정 3. |

### 묶음 9-A 계획

**1. 묶음 사이에 세션 확인 (P0-1)** — `sendPending`의 `for (const chunk of chunkWrites(...))` 안, 매 `save` 직전에 `if (!isCurrent(session)) break;`. 보내지 못한 답은 이전 사람의 캐시 칸에 미전송으로 남는다는 기존 규칙 그대로.

**2. 불러오기 뒤 큐 다시 만들기 (P0-2)** — `hydrate`가 병합한 뒤 `pendingRef`를 `merged.resend` 기준으로 다시 짬. 병합이 남기지 않은 키는 큐에서 뺌.

**3. 실패 상태 지키기 (P1-1, P2-2)** — `loadFailedRef`가 true인 동안은 저장 성공이 `saveError`·`saveState`를 덮지 않음. 세션 변경·`reloadToken` 때는 먼저 `loading`으로.

**4. 거절 답의 시각 (P1-2)** — `applySettled`의 `written_at` 폴백을 `cache.unsent → cache.rejected → write.written_at` 순으로. `Date.now()`는 쓰지 않음.

**5. 첫 렌더 가리기 (P1-3)** — `cache`에 세션 키를 함께 두고, 지금 세션과 다르면 빈 답으로 그림(effect 전 한 프레임 동안 이전 사람의 답이 안 보이게).

**6. 정리 (P2-1, P2-4, P2-5)** — 401/403은 남은 큐를 표시하고 `break`. 실패한 패스 뒤에는 `rerun`하지 않음. "같은 값이면 큐에서 뺀다"를 `dropSent(chunk)` 하나로, provider 없음 검사를 `useWorkbookContext(name)` 하나로.

**7. 테스트** — provider 테스트에 추가:
- 묶음이 둘 이상일 때 첫 묶음 대기 중 세션을 바꾸면 두 번째 묶음이 안 나감(P0-1, 예전 코드에서 실패해야 함).
- 불러오기 중 입력 → 서버가 더 새 값 → 큐가 비고 요청이 안 나감(P0-2).
- 불러오기 실패 후 저장 성공에도 오류 상태 유지(P1-1). 재거절 시 `written_at` 보존(P1-2).

**8. 확인** — `npm run typecheck && npm test && npm run lint`(에러 9개 이하), `npm run build`.

### 결정이 필요한 것

1. **P1-14 로그인 뒤 돌아올 위치.** 장을 URL(`/reader/{id}?chapter={chapterId}`)에 싣는 방안을 권장해요. 서버에 읽던 위치를 저장하는 것이 아니라 돌아올 주소일 뿐이라 범위 밖 기능("읽던 쪽 저장")에 해당하지 않는다고 봐요. 쪽 번호는 싣지 않아요(쪽은 화면마다 다름).
2. **P1-15 잠금 이유의 출처.** 리더 페이지가 서버 `checkBookAccess()` 결과(로그인 필요 / 구매 필요)를 provider에 넘기고, `BlockLockNotice`는 그것만 보게 바꾸는 방안을 권장해요. provider prop이 하나 늘어요. 이렇게 하면 AGENTS.md 워크북 절의 "계정에 저장할 수 없는 독자" 항목(`canWrite`/`lock`·`BlockLockNotice` 설명)도 함께 고쳐요.
3. **P2-3 캐시 쓰기 늦추기.** 늦추면 그 사이 탭이 죽을 때 마지막 몇 글자가 캐시에 없을 수 있어요. `pagehide`에서 즉시 쓰기를 함께 두면 되지만, 오프라인 캐시 보장을 건드리므로 9-D 묶음에서 따로 정해요.
