# Inspic MVP 재구성 TODO

전체 계획과 마일스톤 정의는 `README.md`를 보세요. 이 문서는 진행 중인 마일스톤의 작업 목록입니다.

---

## M0 — 결정과 삭제 ✅ 완료 (2026-08-04)

- [x] `pre-mvp-archive` 태그 생성 (롤백 지점)
- [x] MVP 범위 밖 코드 전량 삭제 — TTS/오디오북, 죽은 리더 서브시스템, 시리즈, 알림, i18n, AI 보조, 협업, 리뷰·팔로우, 워크북 템플릿 7종
- [x] 중복 라우트 통합 — `/studio` → `/creator` 리다이렉트, Header 링크 정리
- [x] 끊어진 링크 수정 — `/editor/:id` → `/create/edit/:id`, 리더 뒤로가기 `/dashboard` → `/my/library`
- [x] 미들웨어 보호 라우트 정리 + 검증 없는 `getSession()` 폴백 제거
- [x] 미사용 의존성 제거 (`lamejs`, `next-intl`)
- [x] README·AGENTS.md를 실제 코드와 일치시킴
- [x] 게이트: typecheck 에러 0, build 통과

**결과**: 29,024줄 → 14,311줄 (−51%), 파일 256 → 146, API 45 → 17

**미해소**: lint 에러 13개. 전부 재구성 이전부터 존재하던 React Compiler 부채이며 삭제 작업과 무관합니다. 별도 정리 필요.

---

## 확정된 결정

| 항목 | 결정 | 확정일 |
|---|---|---|
| 핵심 베팅 | 인터랙티브 워크북 | 2026-08-04 |
| 첫 사용자 | 소수 저자 영입 + 본인 콘텐츠 병행 | 2026-08-04 |
| 코드 접근 | 1안 — 기존 레포 안에서의 재설계 | 2026-08-04 |
| TTS/오디오북 | 완전 삭제 | 2026-08-04 |
| **Supabase 실사용 데이터** | **없음 → 마이그레이션 통합 리셋 가능** | 2026-08-04 |
| 개발 속도 | 제약 아님. 게이트 통과가 우선 | 2026-08-04 |

---

## M1 — 도메인 재설계 ✅ 완료 (2026-08-04)

**게이트**: 마이그레이션이 빈 DB에 적용된다 ✅ · 응답 저장/복원 단위 테스트 통과 ✅ · 크리에이터가 문항을 추가/삭제해도 기존 응답이 보존되는 시나리오 테스트 통과 ✅

### 스키마 — 통합 리셋

- [x] `supabase/migrations/` 기존 8개 파일을 단일 초기 스키마(`00001_initial_schema.sql`)로 교체
- [x] 범위 밖 테이블 제외 (오디오북·리더 서브시스템·시리즈·알림·소셜·구독 전량)
- [x] 유지: `user_profiles`, `books`, `chapters`, `purchases`, `payment_transactions`
- [x] 새 스키마가 빈 DB에 적용되는지 검증 — 임베디드 Postgres(PGlite) 테스트 12개
- [x] **`workbook_blocks`** — 블록 정의. `id`는 DB가 만들지 않고 에디터의 `data-node-id`를 그대로 받음
- [x] **`workbook_block_fields`** — 블록 안의 개별 문항. `(block_id, field_key)` 유일
- [x] **`workbook_responses`** — `(user_id, block_id, field_key)` 단위. 값은 타입별 컬럼(`value_text`/`value_number`/`value_bool`)에 하나만
- [x] RLS: 응답은 작성자 본인만. 크리에이터는 `workbook_response_stats()` 집계 함수로만 조회
- [x] `books.content_type` 제거 + 코드 참조 전량 정리

### 인증

- [x] `user_profiles` 생성을 `auth.users` INSERT 트리거(`handle_new_user`)로 이관
- [x] `user_profiles`에 INSERT 정책을 두지 않아 생성 경로를 트리거 하나로 고정
- [x] `auth-store.ts`의 클라이언트 프로필 생성 경로 2개 제거 (`signUp`, `onAuthStateChange`)

### 블록 ID 규약

- [x] `BaseTemplateNode.ts`의 `parseHTML: ... || generateNodeId()` 폴백 제거
- [x] 블록이 문서에 들어올 때 1회 부여하는 ProseMirror 플러그인 추가 (복사·붙여넣기 중복 ID도 분리)
- [x] 체크리스트 항목에 안정 ID 도입 — 배열 인덱스 대신 항목 ID가 `field_key`

### 응답을 정의에서 분리

- [x] `data-*` 속성에서 독자 응답을 전량 제거: 스케일 `data-value`, SMART 목표 `data-fields`, 체크리스트 항목의 `checked`
- [x] 저작 화면의 해당 입력은 미리보기로 변경 (독자가 채우는 칸)
- [x] `data-template-type` 이름 불일치 수정 — 에디터 `smartGoal` ↔ 리더·내보내기 `smart-goal` (SMART 블록이 리더에서 인터랙티브로 안 뜨던 버그)

### 테스트 도입

- [x] Vitest + React Testing Library 설정 (`npm test`)
- [x] `lib/sanitize.ts` 테스트 26개 — script/이벤트 핸들러 제거, 허용 태그 유지, `data-*` 보존, checkbox 외 input 제거
- [x] `lib/access-control.ts` 테스트 8개 — owner / 무료공개 / 비공개 / 미발행 / 구매자 / 비구매자 / 비로그인
- [x] 워크북 응답 저장·복원 테스트 — 문항 추가·삭제·순서변경·텍스트 수정 후 응답 보존
- [x] 스키마 테스트 12개 — 마이그레이션 적용, 구조, 트리거, 제약
- [x] RLS 동작 테스트 40개 — 정책이 실제로 무엇을 막는지 (아래)

### RLS 동작 검증

임베디드 Postgres에서 `SET ROLE`로 실제 롤을 갈아타며 확인합니다. 하네스는 `src/lib/supabase/__tests__/harness.ts`.

- [x] 유료 책: 비구매자·비로그인은 챕터도 문항도 못 읽고, 구매자만 읽음
- [x] 미발행 챕터는 구매자에게도 안 보이고 소유자만 봄
- [x] 응답은 작성자 본인만 읽기/수정/삭제. 크리에이터도 원문 조회 불가
- [x] 사칭 INSERT(남의 `user_id`)와 무권한 책 응답 INSERT 거부
- [x] `workbook_response_stats()`는 소유자만 실행, 반환 컬럼에 응답 원문 없음
- [x] `user_profiles` 직접 INSERT 거부 (생성 경로는 트리거뿐)
- [x] 남의 이름으로 `purchases` INSERT 거부 (무료 열람 우회 차단)
- [x] 하네스 자체 점검 — 롤 전환이 실제로 걸리는지, 소유자 연결 대조군으로 검증이 헛돌지 않는지
- [x] 뮤테이션 점검 — 정책을 일부러 열었을 때 해당 테스트가 실제로 깨지는 것 확인

**결과**: 테스트 119개 통과. typecheck 0 에러, build 통과. lint 에러 13 → 11 (남은 것은 전부 재구성 이전 부채).

**실제 Supabase 적용**: 2026-08-05 완료. `00001_initial_schema.sql`을 SQL 에디터로 적용했습니다.

---

## M2 — 워크북 저작 (크리에이터 루프) ✅ 완료 (2026-08-05)

**게이트**: 원고 업로드 → 워크북 블록 5종 삽입 → 미리보기 → 공개까지 막힘 없이 완주

### 블록 정의 동기화 — M2의 핵심

M1에서 만든 `extractWorkbookBlocks()`가 어디에도 연결돼 있지 않았습니다. 이제 챕터를 저장하면 정의가 DB에 반영됩니다.

- [x] `sync_chapter_workbook_blocks(chapter_id, blocks)` RPC — 마이그레이션 `00002`
- [x] upsert + 삭제를 **한 트랜잭션**으로 처리 (여러 왕복으로 나누면 중간 실패 시 블록은 새 정의, 문항은 옛 정의로 남음)
- [x] `SECURITY INVOKER` — 권한 판정은 RLS가. 소유자 확인은 조용한 0행 대신 분명한 에러를 내기 위한 것
- [x] `src/lib/workbook/sync-blocks.ts` — 추출 → 저장 가능한 블록만 걸러 RPC 호출
- [x] `POST /api/chapters` · `PUT /api/chapters/[chapterId]` · `POST /api/upload`에 연결
- [x] 동기화 실패해도 던지지 않음 — 챕터 본문은 이미 저장된 뒤라 여기서 던지면 글이 날아간 것처럼 보임. 대신 응답에 `workbook_sync`를 싣고 공개 전 검수가 차단

### 이미지 저장소

- [x] `chapter-images` 버킷 + Storage RLS 정책 (마이그레이션 `00002`)
- [x] `POST /api/books/[bookId]/images` — 경로 `{bookId}/{chapterId}/{임의값}.{확장자}`
- [x] `RichTextEditor`의 base64 인라인 제거 → URL만 본문에 삽입
- [x] 업로드 중·실패 상태를 에디터 하단에 표시 (이전에는 조용히 실패)

### 업로드 파서 분리

- [x] `src/lib/upload-parser.ts`로 분리 — 라우트는 검증과 저장만
- [x] 테스트 20개 — 확장자 판정, 챕터 경계, 제목 추출, 워크북 블록의 `data-*` 보존

### 공개 전 검수

- [x] `src/lib/publish-checks.ts` (순수 판정) + `publish-checks-loader.ts` (DB 조회)
- [x] 차단: 제목 없음 · 챕터 없음 · 빈 챕터 · **응답을 받을 수 없는 블록** · **DB에 저장되지 않은 블록**
- [x] 경고: 워크북 블록 없음 · 미발행 챕터 · base64 인라인 이미지 · 표지 없음 · 소개글 없음
- [x] `GET /api/books/[bookId]/publish-checks` + 미리보기 화면의 검수 패널
- [x] `PUT /api/books/[bookId]`가 출간 전환 시 차단 항목을 서버에서 재검사 (422)
- [x] 편집 화면의 "출판" → "검수 후 공개" — 미리보기를 거쳐야 공개됨

### 함께 고친 것

- [x] **출간해도 아무도 볼 수 없던 문제** — `handlePublish`가 `status`만 바꾸고 `visibility`는 `private`으로 남겼습니다. 이제 공개 시 `visibility: public`을 함께 보냅니다
- [x] `published_at`을 서버가 찍습니다 (비어 있을 때만 — 내렸다 다시 올려도 최초 출간일이 밀리지 않게)
- [x] `countWorkbookBlockElements()` 추가 — `data-node-id`가 없는 블록은 추출 단계에서 버려져 검수가 볼 수 없었습니다
- [x] 워크북 블록만 있는 챕터를 "빈 챕터"로 오판하던 것
- [x] `countWords` 중복 3곳 → `src/lib/content-stats.ts`
- [x] 테스트 하네스가 마이그레이션을 파일명 순서대로 전부 적용 + `storage` 스키마 스텁

### 테스트

- [x] `workbook-sync.test.ts` 16개 — 실제 Postgres에서 RLS를 켠 채로. **정의가 어떻게 바뀌어도 응답은 지워지지 않는다**를 문항 추가/삭제/부활/블록 삭제/순서 변경/챕터 이동으로 확인
- [x] `sync-blocks.test.ts` 10개 — node 환경 (API 라우트가 도는 곳). HTML 파싱은 브라우저와 서버가 다른 구현을 씀
- [x] `publish-checks.test.ts` 15개 · `upload-parser.test.ts` 20개

**결과**: 테스트 121 → 182개 통과. typecheck 0 에러, build 통과. lint 에러 11 → 10 (전부 재구성 이전 부채).

**적용 필요**: `supabase/migrations/00002_workbook_block_sync.sql`을 Supabase에 적용해야 동작합니다. 적용 전에는 챕터 저장 시 블록 정의가 반영되지 않고(응답에 `workbook_sync.ok: false`), 본문 이미지 업로드가 실패합니다.

---

## 이후 마일스톤

M3(워크북 독서) · M4(판매·접근제어) · M5(응답 회수) · M6(실사용 검증)

M3에서 이어받을 것:
- `useBlockAnswers` 훅 내부를 localStorage에서 `workbook_responses`로 교체 (호출부는 그대로)
- 리더 하드코딩(`fontSize`/`theme`) 제거, 저장 상태 표시
- 블록 정의를 `content_html` 파싱 대신 `workbook_blocks`에서 읽을지 결정 (지금은 리더도 HTML에서 뽑음)

각 마일스톤의 범위와 게이트는 `README.md` 참조.

---

## 상시 규칙

- M0~M5 동안 README·이 문서에 없는 기능은 추가하지 않습니다.
- 각 마일스톤 종료 시 `npm run typecheck && npm run build && npm test`를 통과해야 합니다.
- 워크북 데이터 모델을 만질 때는 `AGENTS.md`의 "워크북 데이터 모델" 절을 먼저 읽으세요.
