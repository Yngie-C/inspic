# 3단계 리뷰 결과 — 독자 응답 쓰기 경로

- 날짜: 2026-10-02
- 실행 (경로마다 따로):
  ```
  /code-review high src/app/api/books/[bookId]/responses
  /code-review high src/lib/workbook
  /code-review high src/components/reader/WorkbookResponsesProvider.tsx
  /code-review high src/components/reader/templates
  ```
- 대상 커밋: `f1e6049` (네 경로 모두 `main`과 diff가 없어 파일 전체를 검토)
- 원 지적 40건(경로당 10건). 같은 원인을 여러 경로에서 짚은 것을 합쳐 **29건 (P0 5 · P1 20 · P2 4)**.
- **2차 검증을 거치지 않았어요.** 리뷰어가 호출부(`response-payload.ts`, `response-client.ts`, 리더 템플릿, 마이그레이션 `00002`·`00004`)를 따라가며 근거를 댄 것이지 재현한 것은 아니에요. 고치기 전에 재현 경로를 먼저 확인하세요. 테스트는 실행하지 않았어요.

계획은 [code-review-plan.md](../code-review-plan.md), 이전 결과는 [01-payments-access.md](01-payments-access.md) · [02-db-rls.md](02-db-rls.md)를 보세요.

## 2단계와 겹치는 것

| 이번 단계 | 2단계 |
|---|---|
| P1-9 upsert 충돌 키에 `book_id` 없음 | P1-3 같은 블록 ID가 두 문서에 있음 |
| P1-8 draft 챕터 블록에 응답을 쓸 수 있음 | P1-5 draft 챕터의 문항이 보임 |
| P1-17 블록이 챕터를 옮기면 참여 수가 덮임 | P1-3 (블록 이동), P1-4 (응답 행의 `chapter_id`) |

## 수정 우선순위

1. **P0-1.** 네 리뷰 중 세 곳이 같은 결함을 짚었고, 실제로 답을 잃는 경로예요. 고칠 곳 네 군데를 한 번에.
2. **P0-2.** 한 줄 수정(에러면 500)으로 영구 유실을 막아요.
3. **P0-3 ~ P0-5.** Provider의 저장 순서·hydrate. 한 번에 손보는 편이 나아요(flush 직렬화 + hydrate 병합 규칙).
4. P1 중 저장 상태 표시(P1-5)와 떠날 때 저장(P1-4) — 독자가 "저장된 줄 알았다"를 겪는 것들.
5. 나머지 P1, P2.

---

## P0 — 독자가 쓴 답이 사라지거나 저장되지 않음

### P0-1. 잘못된 항목 하나가 큐에 남아 이후 모든 저장을 막음
- 위치: `src/lib/workbook/response-payload.ts:71` `parseResponseWrites`, `src/components/reader/WorkbookResponsesProvider.tsx:220` (flush catch), `src/components/reader/templates/ChecklistReader.tsx:20` · `ReflectionReader.tsx:22,44` · `ScaleReader.tsx:23` · `SmartGoalReader.tsx:23,65`
- 무엇: 서버는 항목 하나만 잘못돼도 배치 전체를 400으로 거절해요. 클라이언트는 실패한 배치를 통째로 `pendingRef`에 남기고 다음 flush에 다시 실어요. 그래서 한 번 들어간 나쁜 항목이 그 세션의 모든 저장을 실패시켜요. 화면에는 "연결을 확인해 주세요"만 떠요.
- 나쁜 항목이 들어오는 길:
  - 리더 템플릿이 `data-node-id`가 없으면 `blockId = ""`로 입력을 받음 → UUID 검사 실패. (저자 미리보기, 검수 전, 옛 원고, 가져온 HTML)
  - 성찰·SMART textarea에 `maxLength`(20000)가 없음 → 길이 초과.
  - 체크리스트 항목 id가 64자를 넘음 → `field_key` 길이 초과.
  - 오프라인에서 쌓인 쓰기가 200건을 넘음 → 배치 크기 초과.
- 덤: ID 없는 블록끼리 `answers[""]`를 공유해요. 성찰 블록 두 개에 같은 글이 뜨고, 체크박스 `id="-a"`가 겹쳐 라벨을 누르면 다른 블록이 토글돼요.
- AGENTS.md 위반: "응답 저장은 전부 아니면 전무가 아닙니다… 빠진 것은 응답의 `rejected`에 실어", "ID가 없는 블록은 만들어 붙이지 말고 건너뛰세요".
- 고칠 방향:
  1. 리더 템플릿: `data-node-id`가 없으면 입력을 막고(읽기 전용 + 안내) 큐에 넣지 않음.
  2. textarea에 `maxLength={MAX_TEXT_LENGTH}`.
  3. `parseResponseWrites`: 항목 단위 오류는 400 대신 `rejected`로. 400은 본문 자체가 깨졌을 때만.
  4. 클라이언트: 4xx(재시도해도 같은 결과)를 받으면 큐에서 빼고 블록을 실패로 표시. 200건 초과는 나눠 보냄.
  5. 테스트: `response-payload` 단위 테스트에 섞인 배치, Provider에 4xx 후 다음 저장 성공.

### P0-2. 문항 정의 조회 에러를 무시해 답을 영구히 버림
- 위치: `src/app/api/books/[bookId]/responses/route.ts:142` `loadFieldDefinitions`
- 무엇: `workbook_block_fields` SELECT의 `error`를 보지 않아요. 잠깐 DB가 실패하면 `fields = null` → 정의 0개 → 모든 쓰기가 `unknown_field`로 담긴 **200** 응답. 클라이언트는 성공으로 보고 큐에서 지워요(`Provider:186-191`). 재시도할 것이 없어 답은 localStorage에만 남고, 배너는 "저자가 수정 중일 수 있어요"라고 엉뚱하게 안내해요.
- 고칠 방향: 에러면 500. 블록 조회 쪽도 같은지 확인. 라우트 테스트에 조회 실패 케이스.
- 2026-10-02 WP1: **수정됨** ([수정 계획](../code-review-fix-plan.md) WP1). 블록 조회는 원래 500이었음.

### P0-3. 저장 요청 두 개가 동시에 나가 옛 값이 새 값을 덮음
- 위치: `WorkbookResponsesProvider.tsx:183` `flush`, `route.ts:124` upsert
- 무엇: 진행 중인 flush가 있어도 다음 flush를 막지 않고, 서버 upsert는 무조건 마지막 쓰기가 이겨요.
- 시나리오: 'ab' 입력 → PUT#1 느림 → 'abc' 입력 → 600ms 뒤 PUT#2가 먼저 커밋되고 큐에서 X를 지움 → PUT#1이 늦게 커밋돼 DB가 'ab'. 화면은 'abc'와 "저장됨". 다른 기기·새로고침에서 'ab'. 반대로 PUT#1이 PUT#2 성공 뒤 실패하면 다 저장됐는데 상태가 'error'로 남아요.
- 고칠 방향: 클라이언트에서 flush를 직렬화(진행 중이면 끝난 뒤 한 번 더). 서버 쪽 버전·시퀀스 검사는 직렬화로 부족할 때만.

### P0-4. 캐시에만 있던 답이 서버로 가지 않음
- 위치: `WorkbookResponsesProvider.tsx:154` (hydrate)
- 무엇: 로드할 때 캐시 값을 화면에 병합하지만 `pendingRef`에 넣지 않아요. 주석은 "아직 보내지 못한 답"이라고 하지만 보내는 곳이 없어요.
- 시나리오 1: 로그인했지만 구매 전인 독자가 미리보기 챕터에 답함(`canSave` false → 캐시에만) → 구매 후 다시 열면 캐시 값이 보이고 상태는 idle → 영영 PUT되지 않음.
- 시나리오 2: 저장 실패 후 새로고침 → 같은 결과. 다른 기기·내보내기에서 그 답이 없어요.
- 고칠 방향: 캐시에 "미전송" 표시를 두고, 서버 값과 다르면서 미전송인 것만 큐에 넣음. "서버 값이 이긴다"(AGENTS.md)와 충돌하지 않게 — 서버가 더 최신이면 서버를 따름. 기준을 정하려면 캐시 항목에 쓴 시각이 필요해요.

### P0-5. 로딩 중에 입력한 값이 화면에서 지워짐
- 위치: `WorkbookResponsesProvider.tsx:162`
- 무엇: hydrate가 await 전에 찍은 캐시 스냅샷으로 `answersRef`와 상태를 통째로 바꿔요. 그 사이 `setAnswer`로 들어온 값이 화면에서 사라지지만 큐에는 남아 화면과 DB가 어긋나요. 다음 입력이 옛 값 위에서 이어져 방금 쓴 것을 덮어요.
- 고칠 방향: 로드 결과를 병합할 때 `pendingRef`에 있는 키는 현재 값을 유지.

## P1 — 저장 신뢰성·정합성·지표

### 저장과 상태 표시

- **P1-1. `integer` 값을 정수·범위로 검사하지 않음.** `src/lib/workbook/responses.ts:212` `toResponseRow`가 `Number.isFinite`만 봐요. `3.5`·`99999`가 저장되고 `answered_count`에 잡히지만 리더는 맞는 버튼이 없어 미응답처럼 그려요. → `Number.isInteger` + 블록 config의 min/max.
- **P1-2. 공백만 있는 답이 "답함"으로 셈.** `response-payload.ts:128` `normalizeAnswer`가 정확히 `""`만 null로 바꿔요. `"\n"`이 `value_text`로 저장돼 참여율이 부풀어요. → trim 후 빈 값이면 null. `isAnswered()`와 `workbook_response_stats()`도 같은 기준인지 함께 확인.
- **P1-3. GET이 1000행에서 잘림.** `route.ts:36`가 정렬·페이지 없이 전부 SELECT해요. PostgREST 기본 `max_rows`(1000)에 걸리면 긴 워크북을 새 기기에서 열 때 일부 답이 비어 보여요. → 페이지로 나눠 읽거나 범위 지정.
- **P1-4. 페이지를 떠날 때 마지막 배치가 빠짐.**
  - `response-client.ts:42`, `Provider:270`: keepalive 본문은 브라우저 한도 64KB인데, 답 하나 상한이 20000자라 긴 한국어 답 두 개면 넘어요. 거절되면 캐시에만 남고 P0-4 때문에 다시 보내지도 않아요. → 64KB를 넘으면 나눠 보내거나 keepalive 없이 `sendBeacon`/일반 fetch.
  - `Provider:273`: `pagehide`만 들어요. 모바일에서 앱 전환은 `visibilitychange`(hidden)만 오는 경우가 많아요. → 둘 다 듣기.
- **P1-5. 실패 표시와 재시도가 맞지 않음.**
  - `Provider:289` `retry()`는 `flush()`만 불러 큐가 비면 아무 일도 안 해요. 로드 실패 뒤에는 다시 불러오지 않아 빨간 배지가 남아요.
  - `useBlockAnswers.ts:66`: rejected 된 쓰기는 큐에서 지워졌는데 블록에는 "저장 안 됨"과 재시도가 뜨고, 재시도는 보낼 것이 없어요. 다른 저장이 성공하면 그 블록은 "저장 중"으로 영원히 머물러요.
  - `Provider:218`: 뒤이은 성공이 `saveError`를 지우고 'saved'로 바꿔, 거절된 블록 A가 저장된 것처럼 보여요.
  - `ChecklistReader.tsx:27`, `ScaleReader.tsx:34`: 블록의 `failed`를 책 전체 `saveState === "error"`로 판정해, 실패한 적 없는 블록도 입력할 때마다 디바운스 동안 "저장 안 됨"이 떠요.
  - → 실패를 블록 단위로 들고 있고, rejected는 "재시도 불가(저자 수정 대기)"로 따로 표시. 로드 실패의 재시도는 다시 불러오기.
- **P1-6. 계정을 바꾸면 이전 사용자의 답이 새 계정으로 저장될 수 있음.** `Provider:276` unmount cleanup이 이전 viewer의 큐를 flush하는데, 그때 쿠키는 이미 새 세션이에요. 로그아웃이면 401로 버려지고, 같은 책에 접근 가능한 B로 바뀌었으면 A의 답이 B의 행이 돼요. → 큐에 viewerId를 붙이고 세션이 다르면 보내지 않고 A의 캐시에 남김.

### 서버 검증과 경계

- **P1-7. `bookId`를 UUID로 검사하지 않음.** `route.ts:33`. GET은 Postgres 에러 원문을 500으로 내보내고, PUT은 "구매를 확인하세요" 403을 줘요. → 400/404.
- **P1-8. draft 챕터 블록에 응답을 쓸 수 있음.** `route.ts:108` 블록 조회가 `book_id`만 봐요. 2단계 P1-5와 함께 챕터가 published인지 확인.
- **P1-9. upsert 충돌 키에 `book_id`가 없음.** `route.ts:126` `(user_id, block_id, field_key)`. 동기화 RPC가 블록을 다른 책으로 옮기면(2단계 P1-3) 새 책에서의 답이 옛 책의 답을 덮고 `book_id`를 바꿔요. 2단계 P1-3을 고치면(덮지 않고 충돌 보고) 대부분 사라져요.

### 리더 템플릿 입력 경계

- **P1-10. `TEMPLATE_REGISTRY`가 프로토타입 키를 돌려줌.** `TemplateRenderer.tsx:31`, `CalloutReader.tsx:28`. sanitize가 `data-*`를 모두 통과시켜 `data-template-type="hasOwnProperty"`가 Object 내장 함수를 컴포넌트로 렌더하고 챕터 화면 전체가 깨져요. → `Object.hasOwn` 또는 `Map`.
- **P1-11. `ScaleReader`의 min/max를 검증하지 않음.** `ScaleReader.tsx:24`. `NaN`이면 버튼 없음, `0`이면 에디터(1..10)와 리더(0..10)가 다름, `10000000`이면 렌더 중 탭이 멈춤, min>max면 응답 불가. extract-blocks의 `parseIntOr`와 해석을 한 함수로 맞추세요.
- **P1-12. 범위 밖 저장값이면 선택된 버튼 없이 "N 선택됨".** `ScaleReader.tsx:31`. 저자가 max를 줄인 뒤 생겨요. 해제할 방법도 없어요.
- **P1-13. `parseChecklistItems`가 text 타입과 id 중복을 보지 않음.** `ChecklistReader.tsx:21`. text가 객체면 렌더 크래시, id가 겹치면 두 항목이 한 답을 공유하고 "2개 중 2개".
- **P1-14. 높이 자동 조절이 값이 바뀔 때만 돌고 `overflow-hidden`.** `ReflectionReader.tsx:33`, `SmartGoalReader.tsx:57`. 창을 좁히거나 폰을 돌리면 글 아랫부분이 잘려 보이고 스크롤도 안 돼요. → `ResizeObserver` 또는 `field-sizing: content`.
- **P1-15. `hasAnyAnswer`가 "답했다" 판정을 따로 구현.** `useBlockAnswers.ts:40`. AGENTS.md "'답했다'의 판정은 한 곳에서 옵니다" 위반. 값 단위 판정을 `responses.ts`에 두고 같이 쓰세요.

### 블록 정의·지표·내보내기

- **P1-16. 체크리스트 항목 id 길이를 검사하지 않아 챕터 전체 동기화가 실패.** `extract-blocks.ts:134`. 65자 이상 id 하나가 `sync_chapter_workbook_blocks`의 CHECK에 걸려 트랜잭션 전체가 롤백돼요. `unstorableBlocks`는 block id만 봐서 원인이 드러나지 않아요. 4단계(저작 측)와 함께.
- **P1-17. 블록이 챕터를 옮기면 참여 수가 덮임.** `engagement.ts:75`. `workbook_response_stats()`가 `chapter_id`까지 GROUP BY(`00004`)하는데, 동기화 RPC는 응답 행의 `chapter_id`를 바꾸지 않아요. 같은 `(block_id, field_key)`가 두 행으로 오고 `Map.set`이 하나를 버려요. → 합산하거나 stats에서 `chapter_id`를 빼고 묶기.
- **P1-18. `engaged_readers`·`answered_readers`를 최댓값으로 셈.** `engagement.ts:114`. A는 블록 1, B는 블록 2에만 답하면 2가 아니라 1이에요. 체크리스트 블록 단위도 같아요. → 책·블록 단위 DISTINCT user 수를 SQL에서 받기(소유자 제외 규칙 유지).
- **P1-19. 비공개로 내린 챕터의 답이 내보내기에서 고아로 섞임.** `export-answers.ts:62` `splitAnswers`. `loadExportSource`는 published 챕터만 넘겨서, draft로 돌린 챕터의 자유서술 답이 "저자가 이후 수정한 문항의 답"으로 실려요. 6단계(내보내기)와 함께.
- **P1-20. 죽은 export와 그 안의 결함.** `responses.ts:53` `restoreBlockAnswers`, `restoreChapterAnswers`, `orphanedResponses`, `buildAnswerMap`, `toResponseRows`, `response-cache.ts` `clearResponseCache`는 테스트 밖에서 쓰는 곳이 없어요. AGENTS.md는 "복원은 `restoreBlockAnswers()`를 쓰세요"라고 하지만 실제 경로는 `groupAnswersByBlock`·`splitAnswers`예요. `toResponseRows`는 `in`이 프로토타입까지 봐서 id가 `constructor`면 던지고, `clearResponseCache`는 try/catch가 없어요. → 지우고 AGENTS.md 문구를 실제 경로로 고치기.

## P2 — 정리·효율

- **키 규칙 중복과 O(n²) 중복 제거.** `response-payload.ts:99,101,187,194`, `engagement.ts:75,104`가 `responseKey()` 대신 공백 구분자로 키를 직접 만들어요. 중복 제거는 Set + `findIndex`. → `Map<responseKey, ResponseWrite>` 하나로. `sync-blocks.ts`의 `unstorableBlocks`도 한 번 순회로 나누기.
- **PUT 한 번에 순차 왕복 5번 이상.** `route.ts:99` auth → `checkBookAccess`(books, purchases) → blocks → fields, Supabase 클라이언트 3개. blocks·fields는 `workbook_block_fields`에 `workbook_blocks!inner` 임베드 조인 하나로 합칠 수 있어요. 저장 창이 짧아지면 P0-3의 경합 창도 줄어요.
- **Context 값이 매 렌더 새로 만들어짐.** `Provider:283`. React Compiler가 꺼져 있어 입력할 때마다 책의 모든 워크북 블록이 다시 그려져요. → `useMemo`/`useCallback`.
- **`unstorableBlocks`가 `storableBlocks`를 다시 돌림.** 위 첫 항목과 함께 정리.

## 다음 세션에서 할 일

1. P0-1: 리더 템플릿(ID 없음 → 입력 막기, `maxLength`) + `parseResponseWrites`(항목 단위 `rejected`) + Provider(4xx면 큐에서 빼기, 200건 분할).
2. P0-2: `loadFieldDefinitions` 에러면 500.
3. P0-3 ~ P0-5와 P1-4 ~ P1-6: Provider의 flush 직렬화, hydrate 병합 규칙(미전송 표시·pending 유지), 떠날 때 저장, 블록 단위 실패 상태. 한 PR로.
4. P1-8·P1-9는 2단계 P1-3·P1-5와, P1-16은 4단계와, P1-19는 6단계와 같이.
5. 테스트: `workbook-responses.test.ts`(섞인 배치의 부분 저장, 정의 조회 실패 → 500, 비정수·범위 밖 척도 거절, 공백 답 → null), Provider 테스트(4xx 후 다음 저장 성공, 동시 flush 순서, 캐시 미전송분 재전송, 로딩 중 입력 유지). 저장소 키는 프로덕션 함수로 심기(AGENTS.md).
6. 수정 후 `npm run typecheck && npm test && npm run lint`.
