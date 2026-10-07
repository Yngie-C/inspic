# Inspic MVP 재구성 TODO

전체 계획과 마일스톤 정의는 `README.md`를 보세요. 이 문서는 진행 중인 마일스톤의 작업 목록입니다.

---

## 지금 열려 있는 것

**M0~M5 코드 완료. 다음은 M6 (실사용 검증).**

토스 **라이브 계약**(사업자등록 → 통신판매업 신고 → 심사)은 시간이 걸리므로 별도 트랙으로 돌립니다. 라이브가 막는 것은 M6 게이트 중 "독자 유료 구매 1건"뿐입니다. 테스트 키로 할 수 있는 것과 결제가 필요 없는 것을 먼저 합니다. 도메인이 정해지기 전까지는 `publedge.vercel.app`을 씁니다.

2026-10-05 중요도 순으로 다시 묶었습니다. 위 묶음이 아래 묶음을 막습니다. 다만 **4(저자 영입)는 리드타임이 가장 길어 1부터 병행**하고, **도메인은 SMTP를 막으므로 라이브 트랙에서 1로 올렸습니다.**

### 0. 운영 복구 — 가장 먼저

2026-09-22 확인: 운영 Supabase 호스트가 DNS에서 사라졌고(NXDOMAIN) 운영 `/api/explore`가 `fetch failed`로 500을 냅니다. 09-01 이후 활동이 없어 무료 플랜 자동 일시정지에 걸린 것으로 보입니다. keep-alive 워크플로는 없는 시크릿 이름(`SUPABASE_URL`)을 읽고 있어서 **6월부터 한 번도 성공하지 못했습니다.**

옛 프로젝트(`vyktxmpplnehispfsehp`)를 복원하지 않고 **새 프로젝트 `gzodwsbpnruaaapynyry`로 옮겼습니다.** 실사용 데이터가 없었으므로 잃은 것은 테스트 계정·책뿐입니다. 계정은 새로 가입해야 합니다.

- [x] **운영 DB에 `00005`~`00011` 적용 확인** — 지문 쿼리 19줄 전부 `true` (2026-10-05). 처음엔 `00008 written_at 컬럼`만 `false`였습니다(00008의 마지막 문장 `ADD COLUMN written_at`만 빠짐). 그 한 줄을 따로 실행했고, 00008의 여섯 부분(장 FK SET NULL·repoint·draft 가림·쓰기 정책·공백 답 정리·`written_at`)을 하나씩 보는 쿼리 7줄도 전부 `true`입니다. `written_at`이 없으면 응답 저장 라우트·리더·`/my/workbook`이 깨집니다
- [x] **PR #12(내보내기 21건) 병합** (2026-10-05, `58c6c13`). 병합 전 main과 합친 결과로 typecheck·테스트 853개·lint 확인. 이전에는 한글 제목 책의 PDF·EPUB 다운로드가 전부 500이었습니다
- [x] PR #12 병합 뒤 `pdf` 라우트의 1000건 반복문을 `readAllRows()`로 교체 (2026-10-05) (7단계 리뷰에서 충돌을 피하려고 미룬 것)
- [x] Vercel env 교체 — 2026-10-07 완료·재배포. `NEXT_PUBLIC_*` 둘은 Config, `SUPABASE_SECRET_KEY`는 Sensitive (Vercel은 Sensitive에 `NEXT_PUBLIC_` 접두사를 막습니다). (2026-10-05: 운영 번들이 아직 옛 호스트 `vyktxmpplnehispfsehp`를 가리키고 `/api/explore`·`/api/landing` 500) — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. `NEXT_PUBLIC_*`은 빌드 때 번들에 박히므로 **재배포해야 반영됩니다**
- [x] 로컬 `.env.local` 교체 — Supabase 3개가 새 프로젝트를 가리키고 키 둘 다 새 프로젝트 조회 200 (2026-10-05 확인). `SUPABASE_SERVICE_ROLE_KEY`는 `SUPABASE_SECRET_KEY`가 없을 때만 쓰는 대체 변수라 비워 둠. 토스 변수 3개는 3번에서
- [x] 운영 번들이 새 호스트를 가리키고 `/api/explore`가 200인지 확인 — 2026-10-07: 번들에 새 호스트 1곳·옛 호스트 0곳, `/api/explore`·`/api/landing` 200
- [x] 새 프로젝트에 마이그레이션 `00001`~`00004` 적용 — 아래 "이후 마일스톤"의 지문 쿼리 7개 전부 `true` (2026-09-22)
- [x] Auth → URL Configuration: Site URL `https://publedge.vercel.app`, Redirect URLs에 `https://publedge.vercel.app/auth/callback` (2026-09-22)
- [x] GitHub 시크릿 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 교체 (keep-alive가 읽음) (2026-09-23)
- [x] keep-alive가 등록된 시크릿(`NEXT_PUBLIC_SUPABASE_*`)을 읽고, 루트가 아니라 `books` 테이블을 조회하도록 수정
- [x] main에 반영 후 `gh workflow run supabase-keepalive.yml`로 수동 실행해 `HTTP status: 200` 확인 (2026-09-23)
- [x] keep-alive 주기를 5일 → 매일로, curl 실패 시 종료 코드와 원인을 로그에 남기도록
- [x] `/api/landing`이 쿼리 에러를 삼켜 "책 0권"으로 응답하던 것 — 이번 장애가 첫 화면에서 안 보였던 이유

### 1. 메일 발송 — 두 번째 계정부터 막힘

**OAuth를 걷어내 이메일이 유일한 가입 경로입니다.** 새 프로젝트는 기본 SMTP라 조직 팀원 주소로만, 시간당 2통만 보냅니다. 2번의 두 번째 계정부터 여기에 걸립니다.

- [ ] 도메인 확정·연결 (라이브 트랙에서 올림). 커스텀 SMTP는 DNS 인증이 필요해 `publedge.vercel.app`으로는 못 합니다. 토스 심사·webhook 재등록도 이 도메인을 씁니다
- [ ] 커스텀 SMTP(Resend) 연결 — 기존 Resend 무료 팀에 도메인을 추가하기로 했습니다. 절차는 `docs/agent-knowledge/supabase-smtp-setup.md`. 외부 사용자가 들어오는 M6 전에는 필수입니다
- [ ] (도메인 전 임시) 두 번째 계정 주소를 Supabase 조직 팀원으로 넣어 2번을 먼저 진행

### 2. 운영에서 무료 책으로 핵심 루프 한 바퀴

외부 사람을 부르기 전에 내가 먼저 끝까지 통과합니다. 계정 두 개, 기기 두 대.

- [ ] A: 원고 업로드 → 워크북 블록 5종 → 검수 → 무료 공개
- [ ] B: 비로그인 열람 → 로그인 후 복귀 → 작성 → 다른 기기에서 이어 쓰기 → `/my/workbook`
- [ ] A: 참여 지표에 B의 응답이 보이고 본인 응답은 빠지는지
- [ ] 배포본에서 PDF를 한 번 받아 보기 (0번 PR #12 병합 뒤). 폰트가 서버리스 번들에 들어가는지는 `next.config.ts`의 `outputFileTracingIncludes`에 달려 있고, 빌드 트레이스로는 확인했지만 실제 배포에서 확인한 것은 아닙니다
- [ ] 가입 확인 메일의 링크를 누르면 `/auth/callback`을 거쳐 로그인된 상태가 되는지 (2026-10-01부터 `signUp`·재발송은 `emailRedirectTo`로 콜백에 돌아옵니다)
- [ ] Supabase Redirect URLs가 `.../auth/callback?next=/auth/reset-password`(쿼리 포함)를 허용하는지. 막히면 `https://publedge.vercel.app/auth/callback**`를 추가
- [ ] 비밀번호 찾기 → 메일 링크 → `/auth/reset-password`에서 변경 → 새 비밀번호로 로그인
- [ ] Supabase 최소 비밀번호 길이가 화면 문구의 "6자"와 같은지 (10-01에 Letters and digits·6자로 맞춰 둠, 눈으로 한 번만 확인)
- [ ] 본인 책 한 권을 **무료로** 공개 (M6 "워크북 작성 완료 1건" 담당). 위 A와 같은 책으로 해도 됩니다

**무료로 낸 책을 나중에 유료로 바꾸지 마세요.** `has_book_access()`는 `price = 0` 또는 구매 기록만 봅니다. 가격을 올리는 순간 무료로 읽던 독자는 2장부터 잠기고 응답 저장과 PDF도 막힙니다.

### 3. 테스트 모드 결제 → M4 게이트

- [x] `supabase/migrations/00003_payment_integrity.sql`을 Supabase에 적용 (2026-09-01)
- [x] `supabase/migrations/00004_workbook_stats_exclude_owner.sql`을 Supabase에 적용 (2026-09-01)
- [ ] 테스트 키를 Vercel env에 (`NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`)
- [ ] 개발자센터에 webhook 등록 — `https://publedge.vercel.app/api/payments/webhook`. **창닫음 시나리오가 이 경로에 걸려 있으므로 테스트 결제보다 먼저입니다.** 도메인이 바뀌면 다시 등록
- [ ] 테스트 결제로 성공·실패·중복·창닫음 4개 시나리오를 직접 밟기. **M4 게이트의 문구가 이것입니다.** DB·보상 로직은 테스트 35개가 덮고 있지만, 이 저장소의 완료 판정은 "코드가 존재한다"가 아니라 "사용자가 끝까지 통과한다"입니다
- [ ] 다른 한 권은 유료로 워크북화·검수까지 마치고 **비공개로** 대기 → 라이브 날 공개 ("유료 구매 1건" 담당)

**운영이 테스트 키로 도는 동안 유료 책을 공개하지 마세요.** 테스트 승인도 서버에게는 정상 승인이라 `fulfill_payment`가 구매를 만들고, 누구나 테스트 카드로 유료 책을 엽니다. 테스트용 유료 책은 비공개로 둡니다.

### 4. 저자 영입 — 준비는 지금부터 병행

리드타임이 가장 깁니다(관찰 1~2주 + 응답 대기 2주 + 미팅). `wikidocs-authors.csv`는 아직 빈 템플릿입니다. **롱리스트와 관찰은 0번과 함께 시작하세요.**

- [ ] 플레이북 1~3절대로 롱리스트 채우기, priority 1 관찰 시작
- [ ] 오퍼 레터 3종의 `publedge` → Inspic
- [ ] 라이브 전에는 유료 판매가 안 된다는 점을 레터에서 어떻게 말할지
- [ ] "수수료 5% 평생 고정"의 정산 방식 (초기 수동 정산 여부) — `standard-contract.md`와 함께
- [ ] 레터 발송은 2번의 무료 책 공개 이후 (실물 책 링크가 있어야 합니다)
- [ ] 온보딩은 돕지 말고 막히는 지점을 기록 — 게이트가 "도움 없이 출간"입니다

### 5. 병행 — 라이브 계약 트랙

> 2026-10-02: Toss 대신 같은 사업자의 기존 PortOne(NHN KCP) 계약을 옮겨 쓰는 안을 검토 중입니다(보류, KCP 재심사 여부 문의 필요). → `docs/agent-knowledge/payment-provider-portone.md`

- [ ] 사업자등록 → 통신판매업 신고
- [ ] 결제사 결정 — 토스 심사 vs PortOne(KCP) 이전. KCP 재심사 여부 문의부터
- [ ] `Footer.tsx`의 사업자 정보 자리표시자 채우기
- [ ] 토스 전자결제 심사 → 라이브 키 (도메인은 1번에서)
- [ ] 전환: Vercel env 라이브 키 · webhook 새 도메인으로 재등록 · Supabase Auth Site URL·Redirect URLs · `NEXT_PUBLIC_SITE_URL` · **테스트 모드에서 생긴 `purchases`/`payment_transactions` 정리**(두면 테스트 구매자가 계속 열람) · 유료 책 공개

### 6. 남은 정리 — 낮음

- [ ] 코드 리뷰 8단계 결과 문서 `docs/agent-knowledge/code-review-results/08-*.md` 쓰기 (수정은 PR #13으로 병합됨)
- [ ] 탐색 검색을 실제 서버에서 확인 — `C++, Python`, `100%`, `say "hi"` (PostgREST 따옴표 이스케이프)
- [ ] 미리보기에서 쓴 익명 답을 로그인 후 옮길지 — M5 "아직 안 정한 것". M6 실제 독자 반응을 보고 정합니다

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
| 유료 책 미리보기 | 첫 챕터 무료 공개 (비로그인 포함) | 2026-08-05 |
| 무료 책 비로그인 열람 | 읽기 허용, 작성은 로그인 유도 | 2026-08-05 |
| 소프트 페이월(스크롤 오버레이) | 도입하지 않음 — 워크북 입력이 이미 더 나은 로그인 벽 | 2026-08-05 |
| 크리에이터 지표의 소유자 응답 | 집계에서 제외 | 2026-08-08 |
| 고아 응답 표시 | 자유서술(text) 답만 별도 섹션에 | 2026-08-08 |
| 워크북 PDF 범위 | 책 한 권 = PDF 한 권, 내 답이 채워진 상태 | 2026-08-08 |
| Google·Kakao 로그인 | 제거. 제공자 계정이 없어 버튼이 동작하지 않음. 실제 개발 때 다시 붙임 (`/auth/callback`은 범용이라 남김) | 2026-09-22 |

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

## M3 — 워크북 독서 (독자 루프) ✅ 완료 (2026-08-05)

**게이트**: 기기 A에서 작성 → 기기 B에서 이어서 작성이 동작한다 ✅ · 크리에이터가 챕터를 수정·재발행해도 독자 응답이 유지된다 ✅

여기서 처음으로 제품이 존재합니다. M1이 스키마를, M2가 저작 측 쓰기를 붙였고, 이제 독자가 쓴 답이 계정에 남습니다.

### 응답이 DB로 — M3의 핵심

- [x] `POST`가 아니라 `PUT /api/books/[bookId]/responses` — 응답은 문항당 하나뿐이라 멱등한 upsert입니다
- [x] `GET /api/books/[bookId]/responses` — 내가 이 책에 쓴 응답 전부. 리더가 열 때 한 번
- [x] **`chapter_id`와 값 컬럼을 클라이언트가 정하지 않습니다.** 서버가 `workbook_block_fields` / `workbook_blocks`에서 읽어 결정합니다 — 정의가 DB에 없는 블록에는 응답이 매달리지 않고, 남의 챕터 ID를 실어 보낼 수도 없습니다
- [x] `src/lib/workbook/response-payload.ts` — payload 검증(순수) + 정의로 행 조립
- [x] 길이·타입 제약을 DB보다 먼저 검사 — CHECK에 걸리면 배치 전체가 실패해 함께 쓴 답까지 날아갑니다
- [x] 한 건이 잘못돼도 나머지는 저장. 빠진 것은 `rejected`로 돌려주고 리더가 "저장 실패"로 표시
- [x] 빈 문자열은 미응답(null)으로 정규화 — 그대로 저장하면 크리에이터가 보는 참여율이 부풀려집니다. 체크 해제(`false`)는 값으로 남깁니다

### 리더 재작성

- [x] `WorkbookResponsesProvider` — 책 단위로 한 번 불러오고, 낙관적 업데이트 + 600ms 디바운스 배치 저장
- [x] 저장 상태 표시: 저장 중 / 저장됨 / 저장 실패·다시 시도 / 이 기기에만 저장됨
- [x] `localStorage`는 오프라인 캐시로 강등. **서버 값이 캐시를 이깁니다** — 아니면 옛 기기의 답이 되살아납니다
- [x] 탭을 닫을 때 `pagehide`에서 남은 배치를 `keepalive`로 밀어 넣음 (디바운스 안에 떠나면 사라지던 입력)
- [x] `useBlockAnswers`가 `chapterId`를 받지 않습니다 — 응답의 정체성에 챕터가 들어가지 않고, 서버가 정의에서 읽습니다
- [x] provider 없이 워크북 블록을 그리면 던집니다. 저장되는 줄 알았는데 아니었던 것이 이 화면에서 가장 나쁜 실패입니다
- [x] 하드코딩된 `fontSize`/`theme`/`lineHeight` 제거 + 쓰이지 않던 `ReaderTheme`·`ReaderPreferences` 타입 삭제
- [x] 비로그인·미구매·챕터 없음을 각각 안내 (이전에는 전부 "읽을 수 있는 챕터가 없습니다")
- [x] 책 조회를 2회 → 1회로 (`GET /api/books/[bookId]`가 이미 챕터를 함께 돌려줍니다)

### 함께 고친 것

- [x] **로그인 후 돌아오지 못하던 것** — 리더에서 로그인하면 `/dashboard`로 떨어졌습니다. `?redirect=`를 이메일·OAuth 양쪽에 연결했습니다 (`/auth/callback`의 `next`는 이미 있었음)
- [x] `src/lib/safe-redirect.ts` — 오픈 리다이렉트 차단 규칙을 로그인 화면과 콜백이 함께 씁니다
- [x] `value_number`(NUMERIC)를 API 경계에서 숫자로 정규화 — 문자열로 흘러가면 스케일 응답이 조용히 미응답으로 보입니다

### 결정한 것

**블록 정의는 리더도 계속 HTML에서 뽑습니다.** 화면에 무엇이 어디 있는지는 본문 HTML이 정하고(블록은 문단 사이에 박혀 있습니다), DB 정의는 **저장할 때** 서버가 판정 기준으로 씁니다. 둘을 다 DB에서 읽으면 본문과 정의가 어긋났을 때 화면이 비고, 그건 공개 전 검수가 이미 막는 상태입니다.

### 테스트

- [x] `response-payload.test.ts` 15개 — 검증·정규화·행 조립, 한 건 실패가 배치를 죽이지 않는지
- [x] `WorkbookResponses.test.tsx` 9개 — 서버 값이 캐시를 이기는지, 낙관적 업데이트, 실패해도 값이 남는지, 다시 시도, provider 없이 그리면 던지는지
- [x] `ChecklistReader.test.tsx` 6개 — 응답을 인덱스가 아니라 `field_key`로 붙이는지 (실제 Postgres 아닌 화면 단에서 한 번 더)
- [x] `workbook-responses.test.ts` 12개 — PGlite에서 RLS를 켠 채 왕복. 기기 간 이어쓰기, 독자 간 격리, 크리에이터의 원문 조회 차단, 정의 삭제·부활 후 보존
- [x] 뮤테이션 점검 — 캐시가 서버를 이기게, 응답을 인덱스로 매칭하게 일부러 바꿨을 때 해당 테스트가 실제로 깨지는 것 확인

**결과**: 테스트 182 → 220개 통과. typecheck 0 에러, build 통과. lint 에러 10개로 동일 (전부 재구성 이전 부채).

**마이그레이션**: 추가 없음. M1의 `workbook_responses`를 그대로 씁니다.

---

## M4 — 판매와 접근 제어 ✅ 완료 (2026-08-05)

**게이트**: 성공·실패·중복·창닫음 4개 시나리오 검증 ✅ · **승인은 됐는데 구매 기록이 없는 상태가 재현되지 않는다** ✅

M3까지는 "돈을 받는 부분"만 있고 "받은 뒤를 책임지는 부분"이 없었습니다. 승인 뒤 어디서 끊겨도 구매가 생기거나 돈이 돌아가게 만드는 것이 M4입니다.

### 구매 기록의 생성 경로를 서버로 고정 — 먼저 막아야 했던 것

- [x] **`purchases_insert_own` 정책 삭제.** `auth.uid() = user_id`만 봤기 때문에, 로그인한 사용자가 **자기 이름으로** 행을 하나 넣으면 유료 책이 그대로 열렸습니다. `has_book_access()`가 `purchases`를 보고 판정하기 때문입니다. M1 테스트는 *남의* 이름으로 넣는 것만 막혀 있는지 봤습니다
- [x] `payment_transactions_update_own` 정책도 삭제 — 클라이언트가 자기 결제를 `done`으로 고쳐 쓸 이유가 없습니다
- [x] 이제 구매를 만들 수 있는 것은 승인을 확인한 서버뿐입니다 (`user_profiles`를 트리거 하나로 고정한 것과 같은 방식)

### 이행과 보상 — M4의 핵심

- [x] `fulfill_payment(order_id, payment_key, amount, method, raw)` RPC — 마이그레이션 `00003`
- [x] 구매 upsert + 결제 행 갱신 + 둘의 연결을 **한 트랜잭션**으로. 나눠서 왕복하면 중간에 끊겼을 때 정확히 "돈은 받았는데 구매가 없는" 상태가 남습니다
- [x] 멱등 — 같은 주문을 두 번 이행해도 구매는 하나(`already_fulfilled`). 성공 화면 새로고침과 webhook이 겹치는 것이 정상 경로입니다
- [x] `FOR UPDATE`로 잠급니다. 안 잠그면 둘 다 "구매 없음"을 보고 각자 만들려 듭니다
- [x] 승인 금액은 클라이언트가 보낸 값이 아니라 **Toss가 승인한 값**을 씁니다. 요청 시점에 잠근 금액과 다르면 반영하지 않습니다
- [x] `ON CONFLICT (user_id, book_id) DO UPDATE` — `UNIQUE`가 재구매를 막던 것을 풀었습니다. 환불했다가 다시 사는 경로가 살아 있어야 합니다
- [x] 중복 결제(`duplicate_purchase`)는 **아무것도 바꾸지 않고 알려만 줍니다.** 조용히 덮으면 독자는 두 번 내고 한 권을 받습니다
- [x] `src/lib/payments/fulfillment.ts` — 이행 실패·중복이면 **Toss 결제를 취소**하고, 취소까지 실패하면 `stranded`로 남겨 사람이 보게 합니다. 성공인 척하지 않습니다
- [x] `void_payment(order_id, status, raw)` — 취소·만료를 결제 행과 구매 상태에 반영. 전액 취소는 `refunded`로 접근을 닫고, 부분 취소는 유지합니다

### webhook — 창을 닫아도 결제가 유실되지 않게

- [x] `POST /api/payments/webhook` — confirm이 유일한 이행 경로면 승인 직후 창을 닫는 순간 결제와 구매가 갈라집니다
- [x] **본문을 믿지 않습니다.** 꺼내는 것은 주문번호뿐이고 나머지는 Toss에 다시 물어 확인합니다 — 위조한 본문으로는 결제를 만들 수 없습니다
- [x] `TOSS_WEBHOOK_SECRET`(선택)으로 모르는 곳의 요청을 일찍 끊습니다. 방어의 본체는 재조회입니다
- [x] 이행하지 못한 것에만 5xx — Toss는 2xx가 아니면 재시도하므로, 판단해서 넘긴 것까지 재시도를 받으면 같은 요청이 계속 돌아옵니다

### confirm 재작성

- [x] `ALREADY_PROCESSED_PAYMENT`를 실패로 보지 않습니다. **예전 구현은 이것을 승인 실패로 보고 멀쩡히 끝난 결제를 `aborted`로 덮었습니다** — 새로고침 한 번이면 재현됐습니다
- [x] 이미 이행된 주문은 Toss를 부르지 않고 그대로 돌려줍니다. `status = 'done'`을 함께 보는 것은 환불 때문입니다 (취소된 결제도 `purchase_id`는 달고 있습니다)
- [x] 권한은 세션으로, 쓰기는 admin으로. 결제 행을 세션 클라이언트로 읽는 것 자체가 소유 확인입니다(RLS상 자기 결제만 보임)
- [x] 자동 취소된 결제를 붉은 실패 화면으로 보여 주지 않습니다 — 돈이 묶인 줄 알고 다시 결제합니다

### 접근 제어 — 첫 챕터 미리보기, 비로그인 열람

- [x] `chapters_select_preview` 정책 — 공개 발행본의 **맨 앞 published 챕터 하나**는 누구나(비로그인 포함) 읽습니다. 판정은 `book_preview_chapter_id()`로 빼서 정책이 `chapters`를 재귀 평가하지 않게 했습니다
- [x] 워크북 블록 정의는 열지 않습니다. 리더가 블록을 본문 HTML에서 뽑으므로 화면은 그대로 그려지고, 응답은 `has_book_access`가 막습니다
- [x] `checkBookAccess`가 `{ hasAccess, reason, canRead, canSaveResponses }`를 돌려줍니다 — "읽을 수 있는가"와 "답이 계정에 남는가"는 다른 질문입니다
- [x] 미들웨어의 `/reader` 보호 해제. 무엇을 보여 줄지는 리더가 정하고 차단은 RLS가 합니다
- [x] 리더가 미리보기·비로그인 상태를 각각 안내하고, 저장되지 않는 동안에는 화면이 계속 그렇게 말합니다

### 함께 고친 것

- [x] **응답 캐시가 사용자별로 나뉘지 않던 것** — 키가 `inspic_workbook:{bookId}`뿐이었습니다. 비로그인 열람을 열면서 "익명으로 쓴 답이 로그인 화면에 저장된 것처럼 떠오르지만 서버로는 안 가는" 경로가 생겼습니다. 키에 보는 사람을 넣었습니다
- [x] **`.env.example`의 Toss 클라이언트 키 이름이 틀린 것** — 코드는 `NEXT_PUBLIC_TOSS_CLIENT_KEY`를 읽는데 예시는 `TOSS_CLIENT_KEY`였습니다. 그대로 채우면 결제 위젯이 뜨지 않습니다
- [x] `TOSS_SECRET_KEY`를 모듈 로드 시점이 아니라 쓸 때 읽습니다 (`!`로 단정하면 키 없는 환경에서 import만으로 터집니다)
- [x] 결제 완료 화면의 "내 서재로 이동"이 없는 경로(`/library`)를 가리키던 것
- [x] 결제 화면에서 로그인이 필요할 때 `?redirect=`가 없어 홈으로 떨어지던 것

### 테스트

- [x] `supabase/__tests__/payments.test.ts` 22개 — PGlite에서 RLS를 켠 채. 4개 시나리오(성공·검증 실패·중복·창닫음), 재구매, 취소 후 접근 차단, **자기 이름 `purchases` INSERT 차단**, `fulfill_payment`/`void_payment`를 로그인 사용자가 부를 수 없음
- [x] `lib/payments/fulfillment.test.ts` 13개 — 실제 결제로 재현하기 어려운 보상 경로. 이행 실패 → 취소, 중복 → 취소, 취소까지 실패 → `stranded`
- [x] `lib/payments/status.test.ts` 12개 — 모르는 상태를 승인으로도 취소로도 넘겨짚지 않는지
- [x] `rls.test.ts` +5개 — 미리보기가 **첫 챕터 하나로 제한**되는지, 미발행·비공개는 열리지 않는지, 미리보기 챕터의 워크북 문항은 닫혀 있는지
- [x] `access-control.test.ts` 재작성 — `canRead`/`canSaveResponses`가 각각 무엇을 정하는지
- [x] 뮤테이션 점검 9개 — 정책을 되살리고, 멱등을 풀고, 취소를 건너뛰고, 미리보기 제한을 없애고, 캐시 칸을 합쳤을 때 해당 테스트가 실제로 깨지는 것 확인. **이 과정에서 캐시 테스트가 키를 손으로 만들어 헛돌던 것을 발견해 프로덕션 저장 경로를 쓰도록 고쳤습니다**

**결과**: 테스트 220 → 275개 통과. typecheck 0 에러, build 통과. lint 에러 10개로 동일 (전부 재구성 이전 부채).

**적용 필요**: `supabase/migrations/00003_payment_integrity.sql`을 Supabase에 적용해야 동작합니다. 적용 전에는 결제 승인이 구매로 이어지지 않고(`fulfill_payment` 없음), 첫 챕터 미리보기도 열리지 않습니다.

**남긴 것**: 실제 Toss 테스트 결제로 4개 시나리오를 손으로 밟는 것은 키가 있어야 합니다. DB·보상 로직은 위 테스트가 덮고 있으므로, 남은 것은 Toss와의 실제 왕복 확인입니다.

---

## M5 — 응답 회수 ✅ 완료 (2026-08-08)

**게이트**: 독자가 작성한 워크북을 PDF로 받아 볼 수 있다 ✅ · 크리에이터가 "어느 블록에서 독자가 이탈하는지" 볼 수 있다 ✅

M3에서 독자의 답이 계정에 남기 시작했고, M4에서 그 책을 팔 수 있게 됐습니다. M5는 **쌓인 답을 양쪽이 다시 꺼내 보는 것**입니다 — 독자는 자기가 쓴 것을, 저자는 어디서 끊기는지를.

### 한글 PDF — 먼저 부딪힌 것

착수 전 예상대로 깨져 있었고, 예상보다 조용히 깨져 있었습니다.

- [x] **렌더는 성공하고 글자만 깨집니다.** `"한글"`이 Latin-1 한 바이트씩으로 매핑돼(`<5c00...>`) 엉뚱한 글자와 빈칸이 나옵니다. 예외가 없으니 "PDF가 만들어졌다"는 확인으로는 영원히 안 잡힙니다
- [x] Noto Sans KR 서브셋 2종을 `public/fonts/`에 커밋 (각 2.5MB, OFL). 빌드가 외부 네트워크에 의존하지 않게 파일을 둡니다
- [x] `scripts/build-korean-font.sh` — 가변 폰트를 고정 웨이트로 인스턴스화한 뒤 서브셋. react-pdf는 가변 폰트를 읽지 못합니다
- [x] **두 웨이트의 postscript 이름이 서로 달라야 합니다.** pdfkit이 임베드 폰트를 이름으로 캐시해서, 같으면 Bold가 Regular로 덮이고 굵은 글씨가 조용히 사라집니다 (`--update-name-table`이 선택이 아닌 이유)
- [x] 이탤릭 웨이트를 쓰지 않습니다 — 등록하지 않은 `fontStyle`을 주면 렌더가 아예 실패합니다. 기존 `Helvetica-Oblique` 참조를 걷어냈습니다
- [x] 상용 2,350자가 아니라 현대 한글 11,172 음절 전부를 담습니다. 줄여도 2.43MB vs 2.48MB로 차이가 없었고, 독자가 자유서술에 쓸 글자를 미리 알 수 없습니다
- [x] `next.config.ts`의 `outputFileTracingIncludes`로 폰트를 `/api/pdf` 번들에 넣습니다 (`public/`이 서버리스 파일시스템에 있다는 보장이 없습니다). 빌드 트레이스로 포함을 확인했습니다
- [x] **`✓`가 빠져 체크한 항목이 `v`로 찍히던 것** — U+2713은 Dingbats라 기호 범위에서 새어 나갔습니다. 폴백이 쓰는 글자를 폰트 cmap과 대조하는 테스트(`pdf-fallback-glyphs.test.ts`)로 이 부류를 고정했습니다

### 응답이 담긴 PDF — M5의 핵심

- [x] `applyTemplateFallback(html, { answers, emoji })` — 지금까지 늘 **빈 워크시트**를 만들던 함수가 답을 받습니다
- [x] 답은 `(block_id, field_key)`로만 붙습니다. 순서나 인덱스로 붙이면 저자가 문항을 고친 순간 남의 답이 남의 자리에 들어갑니다
- [x] 체크리스트 `✓`/`□`, 척도는 눈금 옆에 고른 값, 리플렉션은 질문 아래 답, SMART는 다섯 칸을 각각
- [x] 자유서술의 줄바꿈을 `<br>`이 아니라 문단으로 나눕니다 — `stripHtmlForPdf()`가 공백을 접어서 여러 줄이 한 줄로 이어 붙습니다
- [x] **PDF는 이모지를 텍스트 라벨로 바꿉니다**(`[팁]`). 한글 폰트에 이모지 글리프가 없습니다. EPUB은 리더기 폰트를 쓰므로 그대로 둡니다
- [x] `stripHtmlForPdf()`에 표 지원 — 없으면 SMART 목표 다섯 항목의 라벨과 답이 한 문단으로 뭉칩니다
- [x] `&nbsp;`만 든 빈 칸이 공백 한 칸으로 남던 것 (엔티티를 공백 접기 전에 풀도록)

### 고아 응답

- [x] `splitAnswers()` — 지금 본문에 있는 문항의 답과, 정의가 사라진 문항의 답을 나눕니다. 기준은 챕터 HTML입니다 (M3에서 정한 대로 — 화면에 무엇이 있는지는 본문이 정합니다)
- [x] 자유서술 답만 "저자가 이후 수정한 문항의 답"으로 챕터 끝에 붙입니다. 응답 행의 `chapter_id`가 남아 있어 원래 챕터를 찾습니다
- [x] 체크·척도 고아는 보여 주지 않습니다 — 질문 문구가 함께 지워져서 `true`나 `7`만으로는 읽히지 않습니다. **버리지는 않습니다.** DB에 그대로 있습니다

### 접근 제어 통일

- [x] `loadExportSource()` — `/api/pdf`와 `/api/epub`이 각자 하던 판정을 `checkBookAccess()` 하나로. 예전 판정은 구매를 보지 않았습니다(실제 유출은 RLS가 막고 있었지만 라우트 자신의 판정은 틀린 채였습니다)
- [x] 미리보기 권한으로는 내보내지 않습니다 — 한 챕터짜리 PDF를 책이라고 내려 주면 산 것과 구분되지 않습니다
- [x] **두 라우트가 없는 `profiles` 테이블을 조회하고 있었습니다.** 실제 이름은 `user_profiles`라 저자명이 늘 "Unknown Author"였습니다
- [x] 내 응답은 세션 클라이언트로 읽습니다 — RLS상 본인 것만 보이므로 그 자체가 소유 확인입니다

### `/my/workbook`

- [x] `GET /api/my/workbooks` — 내가 답을 쓴 책. "구매한 책"과 다릅니다 (무료로 읽으며 쓴 책도 나오고, 샀지만 안 쓴 책은 안 나옵니다)
- [x] 책별 진행률 · 마지막으로 쓴 날 · 이어 쓰기 · PDF 받기
- [x] `summarizeProgress()` — 분모는 지금 책에 있는 문항, 분자는 답이 있는 것. 고아 응답은 양쪽 어디에도 넣지 않습니다 (세면 100%를 넘습니다)
- [x] `downloadExport()` 공용화 — 실패 시 에러 JSON이 파일로 저장되지 않게 `fetch` 후 blob으로 넘깁니다

### 크리에이터 참여 지표

- [x] 마이그레이션 `00004` — `workbook_response_stats()`에서 소유자 제외 (`CREATE OR REPLACE`, 되돌리기 쉬움)
- [x] `GET /api/analytics/workbook?bookId=` + 분석 화면의 참여 절
- [x] **정의에서 출발합니다.** 집계에서 출발하면 아무도 답하지 않은 블록이 목록에서 사라지는데, 그 블록이야말로 찾던 이탈 지점입니다. 0으로 채워서라도 자리를 남깁니다
- [x] 앞 블록 대비 가장 크게 떨어진 자리를 표시합니다
- [x] 문항이 없는 블록(콜아웃)은 뺍니다 — 언제나 0인데 이탈 화면에서 0은 "여기서 다 그만뒀다"로 읽힙니다
- [x] 화면에 "본인이 미리보기에서 쓴 답은 집계에서 제외됩니다"를 적었습니다. 없으면 저자가 자기 책을 테스트하고 0을 보고 고장 난 줄 압니다

### 테스트

- [x] `template-fallback.test.ts` 15개 — 답 주입, 순서가 바뀌어도 `field_key`로 따라가는지, 타입 어긋난 값 무시, 독자가 쓴 태그 이스케이프, PDF의 이모지 대체
- [x] `pdf-generator.test.tsx` 5개 — **결과 PDF 바이트를 열어** 한글 폰트가 임베드됐는지, Bold가 별도 폰트로 들어갔는지, 본문 한글이 Helvetica로 새지 않는지
- [x] `pdf-fallback-glyphs.test.ts` 4개 — 폴백이 쓰는 글자를 폰트 cmap과 대조. 글자를 손으로 나열하지 않고 폴백 결과에서 뽑아서, 블록을 추가해도 따라옵니다
- [x] `export-answers.test.ts` 7개 · `engagement.test.ts` 8개 · `summarizeProgress` 5개
- [x] `rls.test.ts` +1개 — 저자 본인 응답이 집계에서 빠지는지 (실제 Postgres에서)
- [x] 뮤테이션 점검 — 소유자 제외를 되돌리면 해당 테스트가 실제로 깨지는 것, 예전 서브셋이었다면 `✓` 누락을 글리프 테스트가 잡았을 것을 확인

### 눈으로 확인한 것

샘플 PDF를 만들어 ToUnicode CMap으로 본문을 되읽었습니다. 표지·콜아웃(`[팁]`)·리플렉션 답·체크리스트(`✓`/`□`)·척도(`→ 8`)·SMART 다섯 칸·고아 응답 절이 전부 한글로 정상 출력되고, 표준 폰트로 샌 텍스트는 없습니다.

**결과**: 테스트 275 → 320개 통과. typecheck 0 에러, build 통과. lint 에러 10개로 동일 (전부 재구성 이전 부채).

**적용 완료**: `supabase/migrations/00004_workbook_stats_exclude_owner.sql` — 2026-09-01.

### 남긴 것

- EPUB에는 응답을 싣지 않습니다. 게이트가 PDF이고, 워크북을 채워 보는 형식으로 PDF가 맞습니다. 필요해지면 `applyTemplateFallback`에 이미 answers 자리가 있으므로 라우트만 고치면 됩니다
- "본문 없이 문항+답만 모은 답안지"는 M6에서 실제 독자에게 물어보고 정합니다. 지금 만든 것 위에 얹으면 됩니다

### 착수 전에 정한 것 (2026-08-08) — 기록

아래는 착수 **전에** 쓴 글입니다. 셋 다 그대로 구현했습니다. 나중에 뒤집을 때 무엇을 다시 따져야 하는지 알기 위해 판단 근거째로 남깁니다.

세 개 다 중간에 물으면 흐름이 끊기는 것이라 미리 정했습니다. 왜 그렇게 정했는지까지 적어 둡니다.

**1. 집계에서 소유자를 뺍니다.**

`workbook_response_stats()`는 `count(DISTINCT r.user_id)`로 세는데 크리에이터 본인도 들어갑니다. `PreviewFrame`이 리더를 그대로 띄우고 소유자는 `canSaveResponses: true`라 미리보기 입력이 실제 응답 행이 되기 때문입니다.

M6 목표가 "저자 2~3명, 구매 1건"입니다. 독자가 3명일 때 저자가 섞이면 참여율이 25% 부풀고, 최악은 **독자가 0명인데 "1명 응답"으로 보이는 것**입니다.

- 함수에 `r.user_id <> books.owner_id`를 더합니다 (`CREATE OR REPLACE`, 되돌리기 쉬움)
- 미리보기 저장을 막는 방식(`canSave: false`)은 쓰지 않습니다 — 저자가 핵심 루프가 도는지 스스로 확인할 방법이 없어집니다. M3에서 "의도한 동작"으로 정한 것을 뒤집는 것이기도 합니다
- 화면에 "본인 응답은 집계에서 제외됩니다"를 적으세요. 없으면 저자가 자기 책을 테스트하고 "0명"을 보고 고장 난 줄 압니다

**2. 고아 응답은 자유서술(text) 답만 별도 섹션에 보여 줍니다.**

**고아 응답에는 문항 텍스트가 없습니다.** 질문 문구는 `workbook_block_fields.label`에 있는데, 저자가 문항을 지우면 `sync_chapter_workbook_blocks` RPC가 그 행을 지우므로 라벨이 영영 사라집니다. `orphanedResponses()`가 돌려주는 것은 `(block_id, field_key, 값)`뿐입니다.

그래서 블록 종류마다 가치가 갈립니다.

| 블록 | 고아가 되면 | 문항 없이 읽히나 |
|---|---|---|
| 체크리스트 항목 | `item-a3f9: true` | ❌ 무의미 |
| 1–10 스케일 | `7` | ❌ 무의미 |
| 리플렉션 | `"이번 주에 팀에게…"` | ✅ 그 자체로 읽힘 |
| SMART 목표 | 문장 5개 | ✅ 읽힘 |

- `value_text`가 있는 응답만 "저자가 이후 수정한 문항의 답"으로 접어서 보여 줍니다. `value_bool`/`value_number` 고아는 표시하지 않습니다 (버리지는 않습니다 — DB에 그대로 남습니다)
- **문항을 soft delete로 바꿔 라벨까지 살리는 방법은 쓰지 않습니다.** 그게 제대로 된 해결이지만 M2의 sync RPC를 고쳐야 하고 거기엔 테스트 16개가 걸려 있습니다. 저자가 문항을 지우는 건 흔한 경로가 아닌데 가장 잘 보호된 저작 경로를 건드리는 건 위험 대비 보상이 안 맞습니다. M6에서 "저자가 문항을 지웠고 독자가 항의했다"가 실제로 나오면 그때 올리세요

**3. PDF는 책 한 권 단위, 내 답이 제자리에 채워진 상태입니다.**

- 게이트 문구("독자가 작성한 워크북을 PDF로")의 직역이고, 계획서의 "`pdf-generator.tsx` 재사용"과도 맞습니다
- `applyTemplateFallback()`이 지금은 **빈 워크시트**를 만듭니다 (파일 주석에 "응답까지 담는 내보내기는 M5에서"라고 적혀 있습니다). 여기에 응답을 주입하는 것이 작업의 본체입니다
- "본문 없이 문항+답만 모은 답안지"는 매력적이지만(독자가 다시 보는 건 본문이 아니라 자기 답입니다) M6에서 실제 독자에게 물어보고 정합니다. 지금 만드는 것 위에 얹으면 됩니다
- 여러 책을 묶은 "내 워크북 전체" 한 권은 게이트를 넘어서므로 하지 않습니다

### 착수하자마자 부딪힐 것 — 기록 (둘 다 실제로 부딪혔고 해결했습니다)

**PDF에 한글이 안 나올 가능성이 높습니다.** `pdf-generator.tsx`에 TTF 등록이 없고 내장 Helvetica만 씁니다. 내장 Helvetica는 Latin-1만 담고 있어 한글 글리프가 없습니다.

```ts
// Korean characters will fall back to the default renderer behavior
Font.registerHyphenationCallback((word) => [word]);
```

주석 자체가 얼버무리고 있습니다. **M5 시작하자마자 한글 책 하나로 5분 안에 확인하세요.** 깨져 있다면 한글 TTF 서브셋을 번들해야 하고 반나절짜리 별건입니다. 게이트가 PDF에 걸려 있으니 뒤로 미루면 안 됩니다.

**`/api/pdf`의 권한 판정이 구매를 보지 않습니다.** `visibility === "public" && status === "published"`만 봅니다. 실제 유출은 없습니다 — 챕터 조회가 세션 클라이언트라 RLS가 걸러서 미구매자는 미리보기 챕터 하나만 받습니다. 하지만 라우트 자신의 판정은 틀렸고, M5가 이 라우트를 어차피 고치니 `checkBookAccess()`로 통일하세요.

### 아직 안 정한 것

- 미리보기에서 쓴 답(익명 캐시)을 구매·로그인 후 옮겨 줄지. 지금은 칸이 나뉘어 있고 옮기지 않습니다 — 조용히 옮기면 어디서 온 값인지 알 수 없어집니다

---

## 이후 마일스톤

M6(실사용 검증) — 본인 콘텐츠 1권 + 저자 2~3명. 위의 "지금 열려 있는 것"을 먼저 비우세요. 운영 Supabase는 2026-09-22에 새 프로젝트(`gzodwsbpnruaaapynyry`)로 옮겼고 마이그레이션 `00001`~`00011`의 적용이 확인돼 있습니다(2026-10-05, 아래 지문 쿼리 19줄 전부 `true`).

마이그레이션 적용 여부는 이력 테이블이 아니라 객체 존재로 판정합니다(SQL 에디터로 적용하면 `supabase_migrations.schema_migrations`에 기록이 남지 않습니다). 지문: `00003` → `void_payment`/`is_book_public`/`book_preview_chapter_id` 함수와 `chapters_select_preview` 정책이 있고 `purchases_insert_own` 정책이 **없을 것**. `00004` → `workbook_response_stats` 본문에 `v_owner_id`가 있을 것.

SQL 에디터에서 아래를 돌려 19줄이 전부 `true`면 `00001`~`00011`이 모두 들어간 것입니다. 처음 7줄(`00001`~`00004`)은 09-22에 운영에서 전부 `true`였습니다. `00005`~`00011` 줄은 2026-10-05에 더했고, 전체 마이그레이션을 적용한 PGlite에서 전부 `true`인 것을 확인했습니다. 전체 마이그레이션을 적용한 PGlite에서 전부 `true`, `00003`·`00004`를 되돌리면 해당 4줄이 `false`로 바뀌는 것을 확인했습니다. 마이그레이션을 추가하면 여기에 한 줄씩 더하세요.

```sql
SELECT check_name, ok FROM (VALUES
  ('00001 가입 트리거',            EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created')),
  ('00002 블록 동기화 RPC',        EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_chapter_workbook_blocks')),
  ('00002 chapter-images 버킷',    EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chapter-images')),
  ('00003 결제 함수 4개',          (SELECT count(DISTINCT proname) FROM pg_proc
                                     WHERE pronamespace = 'public'::regnamespace
                                       AND proname IN ('fulfill_payment', 'void_payment', 'is_book_public', 'book_preview_chapter_id')) = 4),
  ('00003 첫 챕터 미리보기 정책',  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chapters' AND policyname = 'chapters_select_preview')),
  ('00003 purchases INSERT 봉인',  NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchases' AND policyname = 'purchases_insert_own')),
  ('00004 소유자 응답 제외',       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'workbook_response_stats' AND prosrc LIKE '%v_owner_id%')),
  ('00005 결제 요청 RPC',          EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_payment_request')),
  ('00005 결제 행 INSERT 봉인',    NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_transactions' AND policyname = 'payment_transactions_insert_own')),
  ('00005 구매-결제 연결 컬럼',    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchases' AND column_name = 'payment_transaction_id')),
  ('00006 구매자 책 열람 정책',    EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'books' AND policyname = 'books_select_purchased')),
  ('00006 구매 FK RESTRICT',       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_book_id_fkey' AND confdeltype = 'r')),
  ('00007 블록 ID 충돌 함수',      EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'workbook_block_ids_in_other_books')),
  ('00008 응답 검증 함수',         EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_valid_workbook_response')),
  ('00008 written_at 컬럼',        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workbook_responses' AND column_name = 'written_at')),
  ('00009 본문 대조 동기화 RPC',   EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_chapter_workbook_blocks_if_current')),
  ('00009 책 집계 트리거',         EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'refresh_books_totals')),
  ('00010 covers 버킷',            EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'covers')),
  ('00011 목차 함수',              EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'book_table_of_contents'))
) AS t(check_name, ok);
```

각 마일스톤의 범위와 게이트는 `README.md` 참조.

---

## 상시 규칙

- M0~M6 동안 README·이 문서에 없는 기능은 추가하지 않습니다.
- 각 마일스톤 종료 시 `npm run typecheck && npm run build && npm test`를 통과해야 합니다.
- 워크북 데이터 모델을 만질 때는 `AGENTS.md`의 "워크북 데이터 모델" 절을 먼저 읽으세요.
