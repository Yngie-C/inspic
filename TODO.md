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

## M1 — 도메인 재설계 (다음 — 시작 가능)

**게이트**: 마이그레이션이 빈 DB에 적용된다. 응답 저장/복원 단위 테스트 통과. 크리에이터가 문항을 추가/삭제해도 기존 응답이 보존되는 시나리오 테스트 통과.

### 스키마 — 통합 리셋

보존할 실사용 데이터가 없으므로, 기존 마이그레이션 8개 위에 삭제 마이그레이션을 얹지 않고 **하나의 새 스키마로 재작성**합니다.

- [ ] `supabase/migrations/` 기존 8개 파일을 단일 초기 스키마로 교체
- [ ] 범위 밖 테이블 제외: `audiobooks`, `audio_chapters`, `listening_progress`, `custom_voices`, `highlights`, `bookmarks`, `reading_progress`, `reader_settings`, `highlight_share_events`, `series_metadata`, `series_subscriptions`, `notifications`, `reviews`, `follows`, `collaborators`, `subscriptions`
- [ ] 유지: `user_profiles`, `books`, `chapters`, `purchases`, `payment_transactions`
- [ ] 새 스키마를 빈 Supabase 프로젝트(또는 리셋한 기존 프로젝트)에 적용해 검증
- [ ] **워크북 블록 정의 테이블** — 블록 문항을 `content_html`의 `data-*` JSON에서 분리
- [ ] **워크북 응답 테이블** — `(user_id, book_id, chapter_id, block_id, 필드키)` 단위. 배열 인덱스 매칭 금지
- [ ] RLS: 응답은 작성자 본인만 읽기/쓰기, 크리에이터는 집계만 조회
- [ ] `books.content_type` 컬럼 제거 검토 (시리즈 삭제로 무의미)

### 인증

- [ ] `user_profiles` 생성을 `auth.users` INSERT 트리거로 이관
- [ ] `auth-store.ts`의 클라이언트 프로필 생성 경로 2개 제거 (`signUp`, `onAuthStateChange`)

### 블록 ID 규약

- [ ] `BaseTemplateNode.ts`의 `parseHTML: ... || generateNodeId()` 폴백 제거
- [ ] 블록 생성 시 1회 부여 후 불변 보장

### 테스트 도입

- [ ] Vitest + React Testing Library 설정
- [ ] `lib/sanitize.ts` 테스트 — script/이벤트 핸들러 제거, 허용 태그 유지, `data-*` 보존
- [ ] `lib/access-control.ts` 테스트 — owner / 무료공개 / 비공개 / 구매자 / 비구매자
- [ ] 워크북 응답 저장·복원 테스트 — 문항 추가·삭제·순서변경 후 응답 보존

---

## 이후 마일스톤

M2(워크북 저작) · M3(워크북 독서) · M4(판매·접근제어) · M5(응답 회수) · M6(실사용 검증)

각 마일스톤의 범위와 게이트는 `README.md` 참조.

---

## 상시 규칙

- M0~M5 동안 README·이 문서에 없는 기능은 추가하지 않습니다.
- 각 마일스톤 종료 시 `npm run typecheck && npm run build`를 통과해야 합니다.
- 워크북 데이터 모델을 만질 때는 `AGENTS.md`의 "워크북 데이터 모델" 절을 먼저 읽으세요.
