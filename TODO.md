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

**남은 확인**: 실제 Supabase 프로젝트 적용은 아직입니다. `supabase db reset` 또는 SQL 에디터로 `00001_initial_schema.sql`을 리셋한 프로젝트에 한 번 적용해야 M1이 완전히 닫힙니다. PGlite는 Supabase의 기본 롤·권한을 흉내 낼 뿐이라 실제 `auth.users` 트리거 권한까지는 대신하지 못합니다.

---

## 이후 마일스톤

M2(워크북 저작) · M3(워크북 독서) · M4(판매·접근제어) · M5(응답 회수) · M6(실사용 검증)

M2에서 이어받을 것:
- 챕터 저장 시 `extractWorkbookBlocks()` 결과를 `workbook_blocks` / `workbook_block_fields`에 반영하는 경로
- M3에서 `useBlockAnswers` 훅 내부를 localStorage에서 `workbook_responses`로 교체 (호출부는 그대로)

각 마일스톤의 범위와 게이트는 `README.md` 참조.

---

## 상시 규칙

- M0~M5 동안 README·이 문서에 없는 기능은 추가하지 않습니다.
- 각 마일스톤 종료 시 `npm run typecheck && npm run build && npm test`를 통과해야 합니다.
- 워크북 데이터 모델을 만질 때는 `AGENTS.md`의 "워크북 데이터 모델" 절을 먼저 읽으세요.
