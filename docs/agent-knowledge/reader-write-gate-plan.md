# 답을 저장할 수 없는 독자에게는 워크북 입력을 막는다

> **상태: 구현 완료 (2026-10-20 결정·구현).** 배포 뒤 B 루프로 다시 확인합니다. 진행 상황은 `TODO.md` 2-1.

## Context

지금은 계정에 답을 저장할 수 없는 독자도 워크북에 입력할 수 있습니다(비로그인 독자, 로그인했지만 사지 않은 미리보기 독자). 그 답은 이 기기의 캐시(익명 칸)에만 남고, 로그인해도 계정으로 넘어오지 않습니다. 사용자가 B 루프를 밟다가 이것을 확인했습니다.

넘어오지 않는 것은 설계입니다(익명 칸 분리, 공용 기기 보호). 그런데 비로그인 안내 문구(`ReaderView.tsx`의 `UnsavedNotice`)는 "로그인하면 지금까지 쓴 답이 계정에 저장되고…"라고 약속합니다. 독자 입장에서는 로그인하는 순간 답이 사라지는 것이고, AGENTS.md가 가장 나쁜 실패로 꼽는 "저장되는 줄 알았는데 아니었다"에 해당합니다.

**결정 (2026-10-20):** 기준은 "익명이냐"가 아니라 **"이 답을 계정에 저장할 수 있느냐"(`canSaveResponses`)** 하나입니다. 저장할 수 없으면 문항은 보여 주되 입력은 받지 않고, 로그인 또는 구매로 초대합니다. M5부터 미뤄 둔 "미리보기 답을 로그인 후 옮길지"는 옮길 답이 생기지 않으므로 닫습니다.

가입을 권하는 화면이 되므로, **가입 → 메일 인증 뒤 보던 책으로 돌아오는 경로**도 함께 고칩니다. 지금은 로그인 화면의 "가입" 링크가 `?redirect=`를 버리고, `signUp`의 `emailRedirectTo`에 `next`가 없어 인증 뒤 `/`로 갑니다.

## 구현

### 1. provider — 저장할 수 없으면 쓰지 않는다
`src/components/reader/WorkbookResponsesProvider.tsx`
- `SaveState`의 `"local-only"`를 `"read-only"`로 바꿉니다. "이 기기에만 저장됨"이라는 상태 자체가 없어집니다.
- `canSave`가 false이면:
  - 불러오기 이펙트에서 캐시를 읽어 그리지 않습니다(`cacheRef` = 빈 캐시). 화면에 옛 익명 답이 읽기 전용으로 떠오르지 않게 하기 위해서입니다.
  - 기존 캐시는 지우지 않습니다. 로그인 독자가 예전에 쓴 미전송 답은 구매 뒤 다시 열 때 지금처럼 서버로 갑니다(기존 테스트 "캐시에만 있던 미전송 답을 열 때 서버로 보낸다"가 지킵니다).
  - `setAnswer`는 캐시에도 쓰지 않고 바로 돌아갑니다. 입력이 막혀 있어도 한 번 더 지키는 방어선입니다.
- context에 `bookId`, `canSave`, `signedIn`(`viewerId !== null`)을 싣습니다.
- `useBlockResponses()`의 반환:
  - `canWrite = isStorableBlockId(blockId) && canSave`. 템플릿의 `readOnly`/`disabled`와 상태 표시가 이미 이 값을 보므로, 입력은 자동으로 막힙니다.
  - 새 필드 `lock: "unavailable" | "sign-in" | "purchase" | null`. 블록 ID가 깨졌으면 `unavailable`이 우선이고, 저장할 수 없을 때 로그인 전이면 `sign-in`, 로그인했으면 `purchase`입니다.
- `canSave` 주석(Props)의 "false면 캐시에만 씁니다"를 새 규칙으로 고칩니다.

### 2. 블록 안내 — 한 컴포넌트가 이유별 문구를 고른다
- 새 컴포넌트 `src/components/reader/templates/BlockLockNotice.tsx`를 만들고 `lock`을 받습니다.
  - `unavailable`: 기존 `BlockUnavailable`(`components/ui/workbook-block.tsx`)을 그대로 씁니다.
  - `sign-in`: "로그인하면 여기에 바로 쓸 수 있어요." 문장 안에 [로그인] 링크를 둡니다.
  - `purchase`: "구매하면 여기에 쓸 수 있어요." 문장 안에 [책 정보 보기] 링크를 둡니다.
  - 형태는 `BlockUnavailable`과 같은 muted 한 줄 + 링크입니다. 박스·아이콘 없이, DESIGN.md를 따릅니다.
- 입력이 있는 템플릿 4개(`ReflectionReader`, `SmartGoalReader`, `ScaleReader`, `ChecklistReader`)에서 `{!block.canWrite && <BlockUnavailable />}`를 `<BlockLockNotice lock={block.lock} />`로 바꿉니다. 콜아웃은 입력이 없으므로 그대로 둡니다.
- 로그인 주소 함수 `loginHref(bookId)`를 `ReaderView.tsx`에서 꺼내 `src/components/reader/reader-links.ts`로 옮기고, 리더와 블록 안내가 함께 씁니다.

### 3. 리더 상단 안내·헤더 배지 — 경고에서 초대로
`src/components/reader/ReaderView.tsx`, `src/components/reader/SaveStatusBadge.tsx`
- `UnsavedNotice`를 초대 문구로 바꿉니다. 잃는 답이 없어지므로 색은 warning이 아니라 info입니다.
  - 비로그인: "로그인하면 워크북에 답을 쓸 수 있어요" / "쓴 답은 계정에 남아 다른 기기에서 이어 쓰고 PDF로 받을 수 있어요." 미리보기면 "이미 구매했다면 로그인해 주세요"를 덧붙입니다. 버튼은 [로그인]입니다.
  - 로그인 + 미리보기: "구매하면 워크북에 답을 쓸 수 있어요". 버튼은 [책 정보 보기]입니다.
  - 로그인 + 미리보기 아님 + 저장 불가: 실제로는 생기지 않지만 기존 문구를 정리해 남깁니다.
- `PreviewEnd`의 "쓴 답을 계정에 저장할 수 있어요"를 "답을 쓰고 계정에 남길 수 있어요"로 고칩니다.
- `SaveStatusBadge`는 `read-only`일 때 아무것도 그리지 않습니다. 본문 안내와 블록 안내가 이미 말하고 있습니다.

### 4. 가입 뒤 보던 책으로 복귀
- `src/app/auth/login/LoginForm.tsx`: "가입" 링크에 현재 `redirect`를 실어 `/auth/signup?redirect=…`로 보냅니다.
- `src/app/auth/signup/page.tsx`: `redirect`를 `safeInternalPath()`(`lib/safe-redirect.ts`)로 읽어 `signUp`에 넘기고, 화면 안의 "로그인" 링크에도 다시 싣습니다.
- `src/stores/auth-store.ts`: `signUp`과 재발송에 선택 인자 `next`를 받아 `callbackUrl(next)`로 넘깁니다. `/auth/callback`은 이미 `next`를 `safeInternalPath`로 따릅니다.

### 5. 문서
- `AGENTS.md` 워크북 데이터 모델에 규칙 한 줄을 추가합니다: "계정에 저장할 수 없는 독자(비로그인·미구매 미리보기)에게는 입력을 받지 않습니다(2026-10-20). 문항은 보이고 입력은 막고, 로그인·구매로 안내합니다. 이 기기에만 남는 답을 만들지 마세요." 결제 절의 "응답 캐시 키에는 보는 사람이 들어갑니다"도 이에 맞게 손봅니다(캐시 칸 분리는 유지).
- `TODO.md`:
  - 2-1에 이번 항목을 추가하고 체크합니다.
  - 6번의 "익명 답을 로그인 후 옮길지"와 M5 "아직 안 정한 것"을 "옮길 답을 만들지 않기로 함"으로 닫습니다.
  - 2번 B 루프 문구의 "비로그인 열람 → 로그인 후 복귀 → 작성"을 새 흐름(입력 막힘 → 가입·로그인 → 복귀 → 작성)으로 고칩니다.

## 테스트
- `src/components/reader/WorkbookResponses.test.tsx`: "local-only"를 다루는 네 개(144·158·245·257행 부근)를 새 규칙으로 바꿉니다.
  - 비로그인이면 입력이 읽기 전용이고, 로그인 안내가 보이고, 캐시·서버에 아무것도 쓰지 않는다.
  - 로그인 미구매(미리보기)이면 구매 안내가 보인다.
  - 이 기기에 익명 캐시가 있어도 읽기 전용 화면에 떠오르지 않는다.
  - 캐시 칸 분리 테스트(익명 답이 로그인 화면으로 넘어오지 않는다)는 유지합니다.
- `templates/templates.test.tsx`: 저장할 수 없을 때 템플릿 4종이 모두 입력을 막는지 한 케이스를 추가합니다.
- 테스트에서 캐시를 심을 때는 프로덕션 함수(`response-cache.ts`)를 거칩니다(AGENTS 규칙).
- 가입 복귀: `auth-store`나 signup 테스트가 있으면 `emailRedirectTo`에 `next`가 실리는지 추가하고, 없으면 수동 확인으로 대신합니다.

## 검증
1. `npm run typecheck`, `npm test`, `npm run lint`(에러 10개에서 늘지 않을 것), `npm run build`
2. 로컬 수동 확인(`npm run dev`):
   - 로그아웃 상태로 무료 책 리더 → 문항은 보이고 입력은 막힘 → 블록 안내의 [로그인] → 로그인 → 같은 책으로 복귀 → 입력·저장됨
   - 로그인 화면의 [가입] → 가입 메일 링크 → 같은 책 리더로 돌아오는지
   - 로그인했지만 사지 않은 유료 책의 미리보기 → 구매 안내, 입력 막힘
3. 배포 뒤 B 루프 나머지(다른 기기에서 이어 쓰기)를 이 흐름으로 다시 밟습니다.

## 범위 밖
- 보던 **장**으로 돌아오기. 지금 복귀 주소는 책 단위(`/reader/[bookId]`)이고, 첫 장부터 다시 열립니다. 테스트 독자 반응을 보고 2-1 후보로 남깁니다.
- 익명 캐시 칸 코드(`response-cache.ts`의 `ANONYMOUS`)는 지우지 않습니다. 칸 분리가 여전히 옛 캐시가 섞이는 것을 막습니다.
