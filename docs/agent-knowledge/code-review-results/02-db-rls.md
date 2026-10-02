# 2단계 리뷰 결과 — DB 스키마와 RLS

- 날짜: 2026-10-02
- 실행: `/code-review high supabase/migrations`
- 대상 커밋: `b37c3a3` (마이그레이션은 `main`과 diff가 없어 `00001`~`00004` 전체를 검토)
- 지적 10건 (P0 3 · P1 5 · P2 2)
- 결제 두 건(P0-1, P0-2)은 리뷰 중에 앱 코드와 대조했어요. `/api/payments/request`가 사용자 클라이언트(RLS)로 결제 행을 INSERT하고, `fulfillment.ts`는 금액을 `books.price`와 비교하지 않아요. **나머지는 2차 검증을 거치지 않았어요.** 고치기 전에 재현 경로를 먼저 확인하세요. 테스트는 실행하지 않았어요.

계획은 [code-review-plan.md](../code-review-plan.md), 1단계 결과는 [01-payments-access.md](01-payments-access.md)를 보세요.

## 1단계와 겹치는 것

같은 원인을 DB 쪽에서 다시 짚은 것이라, 고칠 때 한 번에 처리하세요.

| 이번 단계 | 1단계 |
|---|---|
| P0-1 결제 행 직접 INSERT | P0-6 |
| P0-2 재구매 후 옛 취소가 새 구매를 환불 | P0-2 |
| P1-1 `has_book_access`가 공개 상태를 구매보다 먼저 봄 | P1 접근 제어 `:78` |

## 수정 우선순위

1. P0-1 ~ P0-3. 결제 무결성. 셋 다 새 마이그레이션(`00005`) 하나로 묶을 수 있어요.
2. P1-1 (구매자 접근 유지) — 1단계 P1과 함께, TS `access-control.ts`도 같이.
3. P1-2 ~ P1-5 (노출·정합성).
4. P2.

---

## P0 — 결제 무결성

### P0-1. 로그인 사용자가 결제 행을 직접 INSERT할 수 있음 (금액·구매 위조)
- 위치: `00001_initial_schema.sql:344` `payment_transactions_insert_own`
- 무엇: `00003`은 UPDATE 정책만 지웠고 INSERT 정책은 남았어요. 금액·상태·`purchase_id`를 클라이언트가 정해요.
- 시나리오 1: anon 키 + 본인 JWT로 `{book_id: <3만원 책>, toss_order_id: 'X', amount: 100}` INSERT → Toss 위젯에서 orderId X로 100원 결제 → confirm. 결제 행 금액(100) = 요청 금액(100) = Toss 승인 금액(100)이라 `fulfill_payment`의 `v_tx.amount <> p_amount` 검사를 통과하고 구매가 생겨요. `books.price`와 비교하는 곳이 없어요.
- 시나리오 2: 책 소유자는 `purchases_select_as_seller`로 구매자의 purchase id를 읽을 수 있어요. 그 id를 `purchase_id`로 단 행을 넣고 그 주문이 취소되면 `void_payment`가 남의 구매를 환불 처리해요.
- 고칠 방향: INSERT 정책 제거(`purchases`처럼 봉인). 결제 행 생성은 `/api/payments/request`가 서버에서 `books.price`를 읽어 service_role 또는 RPC로. `fulfill_payment`에서도 금액을 책 가격과 대조할지 검토. `rls.test.ts`에 차단 케이스.

### P0-2. 재구매 뒤 옛 주문의 취소가 새 구매를 환불로 바꿈
- 위치: `00003_payment_integrity.sql:218` (`fulfill_payment`의 `ON CONFLICT DO UPDATE`), `void_payment`
- 무엇: 환불 뒤 재구매하면 같은 `purchases` 행을 되살려요. 옛 주문 A의 결제 행은 여전히 그 `purchase_id`를 가리켜요.
- 시나리오: A 구매 → 환불(A canceled, 구매 refunded) → B로 재구매(같은 P가 completed) → Toss가 A 취소 webhook을 재전송 → `void_payment(A)`가 P를 `refunded`로. 돈을 낸 B의 책이 닫혀요.
- 고칠 방향: 구매를 마지막으로 이행한 결제(예: `purchases.payment_transaction_id`)가 이 결제일 때만 회수. 재이행할 때 옛 결제 행의 연결을 끊는 방법도 있어요. `payments.test.ts`에 재구매 후 옛 취소 케이스.

### P0-3. `fulfill_payment`가 결제 행 상태를 보지 않음
- 위치: `00003_payment_integrity.sql:106`
- 무엇: `void_payment`가 이미 `canceled`로 바꾼 결제 행으로도 구매를 만들고, 상태를 `done`으로 덮어요.
- 시나리오: 성공 화면 confirm이 Toss에서 DONE을 받음 → RPC 호출 전에 결제가 취소되고 취소 webhook이 먼저 `void_payment` 실행(`purchase_id`가 아직 NULL이라 회수할 것 없음) → confirm이 `fulfill_payment` 호출 → 구매 completed, 행은 `done`. 환불된 결제로 책이 열리고 취소 기록은 사라져요.
- 고칠 방향: `v_tx.status`가 종결 상태(`canceled`/`partial_canceled`/`aborted`/`expired`)면 이행하지 않고 별도 outcome을 돌려줌. 호출부는 그 outcome을 보상 없이 종료로 처리.

## P1 — 접근·노출·정합성

### P1-1. 구매자가 산 책을 잃음
- 위치: `00001_initial_schema.sql:176` `has_book_access`
- 무엇: completed 구매가 있어도 책이 `published` + `public`이어야 통과해요.
- 결과: 저자가 보관하거나 비공개로 돌리면 구매자의 `chapters_select`가 비고, `workbook_responses` INSERT/UPDATE가 WITH CHECK에서 막혀요. "돈이 나갔으면 책이 열린다"에 어긋나요.
- 고칠 방향: 구매 확인을 공개 판정보다 먼저. TS `checkBookAccess()`도 함께. `unlisted` 처리(1단계 P1)도 같은 마이그레이션에서 결정.

### P1-2. 유료 챕터 이미지 파일 목록이 익명에게 열림
- 위치: `00002_workbook_block_sync.sql:198` `chapter_images_select_public`
- 무엇: anon에게 `chapter-images` 버킷 전체 SELECT를 줘서 Storage list API가 동작해요. "추측할 수 없는 파일명"으로 막으려던 것이 무너져요.
- 시나리오: `storage.from('chapter-images').list('<유료 bookId>/<chapterId>')` → 파일명 전부 → 공개 URL로 다운로드. book id는 URL에 공개돼 있어요.
- 고칠 방향: 공개 버킷은 SELECT 정책 없이도 공개 URL을 서빙하므로 정책을 지우거나 소유자로 좁힘. 하네스의 storage 스텁도 확인.

### P1-3. 같은 블록 ID가 두 문서에 있으면 블록이 오락가락함
- 위치: `00002_workbook_block_sync.sql:94` 블록 upsert
- 무엇: `data-node-id`를 전역 키로 써서, 저장하는 챕터·책으로 기존 블록을 조용히 옮겨요.
- 시나리오: 챕터 1의 블록을 챕터 2(또는 다른 책)에 복사·붙여넣기 → ProseMirror 중복 제거는 한 문서 안에서만 동작 → 두 챕터가 같은 id → 저장할 때마다 `chapter_id`/`book_id`가 마지막 저장 쪽으로 이동 → 다른 쪽의 출간 검수가 "DB에 없는 블록"으로 차단. 다른 소유자의 블록 id와 겹치면 `ON CONFLICT DO UPDATE`가 UPDATE RLS에 걸려 RPC 전체가 실패하고, 그 챕터는 다시는 동기화되지 않아요.
- 고칠 방향: 다른 챕터·책의 블록과 충돌하면 덮지 말고 결과로 보고. 붙여넣기 시 문서 밖에서 온 id를 재부여할지는 4단계(저작 측)에서 함께 결정 — 재부여는 AGENTS.md의 "block_id 재생성 금지"와 부딪히므로 "붙여넣기 시점 1회"로만 한정해야 해요.

### P1-4. `workbook_responses` 직접 쓰기가 서버 검증을 건너뜀
- 위치: `00001_initial_schema.sql:375` (INSERT 정책), `:352` `workbook_blocks_insert_own`
- 무엇: INSERT 정책은 `user_id`와 `has_book_access(book_id)`만 봐요. `chapter_id`가 그 책의 챕터인지, `(block_id, field_key)`가 존재하는지 확인하지 않아요. `workbook_blocks_insert_own`도 `chapter_id`와 `book_id`를 묶지 않아요.
- 결과: 무료 책 독자가 PostgREST로 임의 `block_id`/`field_key`, 또는 다른 저자의 `chapter_id`를 단 행을 넣으면 `workbook_response_stats()`에 유령 문항과 부풀린 응답 수가 잡혀요. 남의 챕터가 삭제될 때 CASCADE로 함께 지워지기도 해요. AGENTS.md "chapter_id와 값 컬럼은 서버가 정한다"에 어긋나요.
- 고칠 방향: 클라이언트 직접 쓰기 정책을 막고 `PUT /responses`가 service_role/RPC로 쓰게 하거나, WITH CHECK에 `workbook_block_fields` 존재와 챕터-책 일치를 넣음. 3단계(응답 쓰기) 리뷰와 함께.

### P1-5. draft 챕터의 문항이 보임
- 위치: `00001_initial_schema.sql:350` `workbook_blocks_select`, `workbook_block_fields_select`
- 무엇: `has_book_access`만 보고 챕터 상태를 보지 않아요. `chapters_select`는 draft 본문을 가리는데 문항은 열려 있어요.
- 결과: 구매자나 무료 책 독자가 `workbook_block_fields` ⨝ `workbook_blocks`로 공개 전 챕터의 질문을 미리 읽어요.
- 고칠 방향: SELECT 정책에 챕터가 published이거나 소유자일 것을 추가. 미리보기 챕터의 블록은 열지 않는다는 기존 규칙은 유지.

## P2 — 정리·효율

- **`00002_workbook_block_sync.sql:116` 페이로드에 같은 블록 id가 반복되면 문항이 섞임.** 블록은 `DISTINCT ON`으로 하나만 남기지만 문항은 `(block_id, field_key)`로만 중복을 거르고, `f.ordinality`가 블록마다 다시 시작해 어느 `input_type`이 남을지 정해지지 않아요. 정의가 `block_type`과 어긋나면 서버가 타입 불일치로 독자 응답을 거절해요. → 문항도 같은 블록 항목에서만 가져오게.
- **`00003_payment_integrity.sql:303` `chapters_select_preview`가 행마다 SECURITY DEFINER 함수 두 개.** 인라인되지 않아, 챕터 200개짜리 책 목차를 비구매자가 열면 `ORDER BY ... LIMIT 1` 서브쿼리 약 200번 + books 조회 약 200번. → `chapter_is_preview(id, book_id)` 하나로 합치거나 미리보기 플래그를 미리 계산.

## 다음 세션에서 할 일

1. `00005` 마이그레이션: P0-1(INSERT 봉인 + 서버 경로), P0-2(최근 이행 결제 기준 회수), P0-3(종결 상태 이행 거부). 1단계 P0-2·P0-6과 한 번에.
2. P1-1은 1단계 접근 제어 P1, `unlisted` 제품 결정과 함께.
3. P1-3·P1-4는 3·4단계 리뷰 결과를 본 뒤 같이 고치는 편이 나아요.
4. 테스트: `rls.test.ts`(결제 행 INSERT 차단, draft 문항 차단, 응답 직접 INSERT 차단), `payments.test.ts`(재구매 후 옛 취소, 취소 후 이행 거부), `workbook-sync.test.ts`(id 충돌).
5. 수정 후 `npm run typecheck && npm test && npm run lint`.
