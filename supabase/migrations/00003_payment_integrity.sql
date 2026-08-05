-- ============================================================
-- M4 — 판매와 접근 제어
--
-- 1. 구매 기록을 클라이언트가 만들지 못하게 막습니다 (무료 열람 우회)
-- 2. 결제 승인을 구매로 반영하는 이행 RPC — 멱등, 한 트랜잭션
-- 3. 취소·환불을 접근 권한에 반영하는 RPC
-- 4. 유료 책의 첫 챕터 미리보기
--
-- 적용: Supabase SQL 에디터 또는 `supabase db push`.
-- 00002가 이미 적용된 프로젝트에 이어서 올리세요.
-- ============================================================

-- ============================================================
-- 1. 구매 기록의 생성 경로를 서버 하나로 고정
--
-- purchases_insert_own은 `auth.uid() = user_id`만 봤습니다. 남의
-- 이름으로 넣는 것은 막았지만 자기 이름으로 넣는 것은 통과했고,
-- has_book_access()가 purchases를 보고 판정하므로 로그인한 사용자는
-- 누구나 유료 책 행을 하나 넣어 본문을 열 수 있었습니다.
--
-- 구매 기록은 결제 승인을 확인한 서버만 만듭니다. 아래 RPC가
-- 유일한 경로이고, 클라이언트에는 INSERT 정책을 두지 않습니다.
-- (user_profiles를 트리거 하나로 고정한 것과 같은 방식입니다.)
--
-- payment_transactions의 UPDATE도 같은 이유로 회수합니다. 결제 행을
-- 스스로 'done'으로 바꾸는 것만으로는 접근 권한이 생기지 않지만,
-- 클라이언트가 자기 결제 상태를 고쳐 쓸 이유가 없습니다. 갱신은
-- 승인 결과를 손에 쥔 서버만 합니다.
-- ============================================================

DROP POLICY IF EXISTS purchases_insert_own ON purchases;
DROP POLICY IF EXISTS payment_transactions_update_own ON payment_transactions;

-- ============================================================
-- 2. fulfill_payment — 승인된 결제를 구매로 반영
--
-- 한 함수 안에서 처리하는 이유는 트랜잭션입니다. 여기서 하는 일은
-- (1) 구매 기록 upsert (2) 결제 행을 done으로 갱신 (3) 둘을 연결
-- 세 가지인데, 나눠서 왕복하면 중간에 끊겼을 때 "돈은 받았는데
-- 구매 기록이 없는" 상태가 남습니다. M4가 없애려는 상태가 바로
-- 그것입니다.
--
-- 멱등합니다. 같은 주문을 두 번 이행해도 구매는 하나이고, 두 번째
-- 호출은 already_fulfilled를 돌려줍니다. 성공 화면 새로고침과
-- webhook이 같은 결제를 동시에 들고 와도 안전해야 합니다.
--
-- SECURITY DEFINER이고 실행 권한을 회수합니다. anon/authenticated가
-- 부를 수 있으면 1번에서 막은 구멍이 그대로 돌아옵니다.
--
-- 승인 사실 자체는 검증하지 않습니다. 그것은 Toss API에 물어본
-- 서버가 이미 확인한 뒤이고, 이 함수는 service_role만 부릅니다.
--
-- 반환: { outcome, purchase_id, book_id, user_id }
--   granted            새로 구매를 만들었습니다
--   already_fulfilled  이 결제는 이미 반영돼 있습니다
--   duplicate_purchase 다른 결제가 이미 이 책을 열어 줬습니다.
--                      아무것도 바꾸지 않았으니 호출자가 이번 결제를
--                      취소해야 합니다
-- ============================================================

CREATE OR REPLACE FUNCTION public.fulfill_payment(
  p_order_id    TEXT,
  p_payment_key TEXT,
  p_amount      INTEGER,
  p_method      TEXT,
  p_raw         JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tx          payment_transactions%ROWTYPE;
  v_existing    purchases%ROWTYPE;
  v_purchase_id UUID;
BEGIN
  -- FOR UPDATE: 성공 화면과 webhook이 같은 주문을 동시에 들고 오는
  -- 것이 정상 경로입니다. 잠그지 않으면 둘 다 "구매 없음"을 보고
  -- 각자 만들려 듭니다.
  SELECT * INTO v_tx
    FROM payment_transactions
   WHERE toss_order_id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment transaction not found: %', p_order_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 결제 요청 시점에 잠근 금액과 다르면 반영하지 않습니다.
  IF v_tx.amount <> p_amount THEN
    RAISE EXCEPTION 'amount mismatch for %: locked %, approved %',
      p_order_id, v_tx.amount, p_amount
      USING ERRCODE = 'check_violation';
  END IF;

  -- 한 주문에 결제 키는 하나입니다. 달라졌다면 주문 번호를 재사용한
  -- 다른 결제이므로 반영하지 않습니다.
  IF v_tx.toss_payment_key IS NOT NULL
     AND v_tx.toss_payment_key <> p_payment_key THEN
    RAISE EXCEPTION 'payment key mismatch for %', p_order_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_tx.purchase_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'outcome',     'already_fulfilled',
      'purchase_id', v_tx.purchase_id,
      'book_id',     v_tx.book_id,
      'user_id',     v_tx.user_id
    );
  END IF;

  SELECT * INTO v_existing
    FROM purchases
   WHERE purchases.user_id = v_tx.user_id
     AND purchases.book_id = v_tx.book_id
     FOR UPDATE;

  -- 다른 결제가 이미 이 책을 열어 줬습니다 (탭 두 개에서 각각 결제).
  -- 여기서 조용히 덮으면 독자는 두 번 내고 한 권을 받습니다.
  IF FOUND AND v_existing.status = 'completed' THEN
    RETURN jsonb_build_object(
      'outcome',     'duplicate_purchase',
      'purchase_id', v_existing.id,
      'book_id',     v_tx.book_id,
      'user_id',     v_tx.user_id
    );
  END IF;

  -- UNIQUE(user_id, book_id) 때문에 재구매는 INSERT로 들어오지
  -- 않습니다. 환불했다가 다시 사는 경로를 살려 두려면 upsert여야
  -- 합니다.
  INSERT INTO purchases (user_id, book_id, price_paid, payment_method, status)
  VALUES (v_tx.user_id, v_tx.book_id, p_amount, p_method, 'completed')
      ON CONFLICT (user_id, book_id) DO UPDATE
     SET status         = 'completed',
         price_paid     = EXCLUDED.price_paid,
         payment_method = EXCLUDED.payment_method,
         purchased_at   = now()
  RETURNING id INTO v_purchase_id;

  UPDATE payment_transactions
     SET toss_payment_key = p_payment_key,
         status           = 'done',
         method           = p_method,
         raw_response     = p_raw,
         purchase_id      = v_purchase_id,
         updated_at       = now()
   WHERE id = v_tx.id;

  RETURN jsonb_build_object(
    'outcome',     'granted',
    'purchase_id', v_purchase_id,
    'book_id',     v_tx.book_id,
    'user_id',     v_tx.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.fulfill_payment(TEXT, TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.fulfill_payment(TEXT, TEXT, INTEGER, TEXT, JSONB) FROM anon, authenticated;

-- ============================================================
-- 3. void_payment — 취소·만료·환불을 접근 권한에 반영
--
-- 결제가 취소되면 책도 닫혀야 합니다. has_book_access()는
-- status='completed'인 구매만 보므로 'refunded'로 바꾸면 닫힙니다.
-- 행을 지우지 않는 것은 무엇이 있었는지 남기기 위해서입니다.
--
-- 부분 취소는 접근을 유지합니다. 책은 한 권 단위로 팔리므로 부분
-- 취소는 정상 경로가 아니고, 애매한 상태에서 독자가 쓰던 워크북을
-- 닫는 쪽이 더 나쁩니다.
--
-- 반환: { outcome, purchase_id, revoked }
-- ============================================================

CREATE OR REPLACE FUNCTION public.void_payment(
  p_order_id TEXT,
  p_status   TEXT,
  -- 승인 전에 죽은 결제에는 남길 응답이 없습니다. 그때 있던 것을
  -- 지우지 않도록 기본값을 두고 COALESCE로 받습니다.
  p_raw      JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tx      payment_transactions%ROWTYPE;
  v_revoked BOOLEAN := false;
BEGIN
  IF p_status NOT IN ('canceled', 'partial_canceled', 'aborted', 'expired') THEN
    RAISE EXCEPTION 'not a void status: %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_tx
    FROM payment_transactions
   WHERE toss_order_id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment transaction not found: %', p_order_id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE payment_transactions
     SET status       = p_status,
         raw_response = COALESCE(p_raw, payment_transactions.raw_response),
         updated_at   = now()
   WHERE id = v_tx.id;

  IF v_tx.purchase_id IS NOT NULL AND p_status <> 'partial_canceled' THEN
    UPDATE purchases
       SET status = 'refunded'
     WHERE id = v_tx.purchase_id
       AND status = 'completed';
    v_revoked := FOUND;
  END IF;

  RETURN jsonb_build_object(
    'outcome',     'voided',
    'purchase_id', v_tx.purchase_id,
    'revoked',     v_revoked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_payment(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_payment(TEXT, TEXT, JSONB) FROM anon, authenticated;

-- Supabase는 service_role에도 기본 EXECUTE를 주므로 위 REVOKE 뒤에도
-- 남아 있지만, 프로젝트 설정에 기대지 않고 명시합니다. 테스트
-- 하네스에는 service_role이 없으므로 있을 때만 겁니다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fulfill_payment(TEXT, TEXT, INTEGER, TEXT, JSONB) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.void_payment(TEXT, TEXT, JSONB) TO service_role';
  END IF;
END;
$$;

-- ============================================================
-- 4. 첫 챕터 미리보기
--
-- 유료 책은 지금까지 본문을 한 글자도 보여 주지 않았습니다. 독자가
-- 소개글만 보고 결제해야 했다는 뜻입니다.
--
-- 공개 발행본의 published 챕터 중 맨 앞 하나는 누구나(비로그인
-- 포함) 읽습니다. 나머지는 그대로 막힙니다.
--
-- 정책 안에서 chapters를 서브쿼리로 다시 읽으면 같은 정책이 재귀
-- 평가되므로, 판정은 SECURITY DEFINER 함수로 빼고 정책은 함수만
-- 부릅니다 (00001의 is_book_owner / has_book_access와 같은 방식).
--
-- 워크북 블록 정의(workbook_blocks)는 열지 않습니다. 리더는 블록을
-- 본문 HTML에서 뽑으므로 미리보기 화면은 그대로 그려지고, 응답은
-- 어차피 has_book_access가 막습니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_book_public(p_book_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM books b
    WHERE b.id = p_book_id
      AND b.status = 'published'
      AND b.visibility = 'public'
  );
$$;

-- 미리보기로 열어 줄 챕터. 없으면 NULL이고, 그러면 정책은 아무
-- 행에도 맞지 않습니다.
CREATE OR REPLACE FUNCTION public.book_preview_chapter_id(p_book_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id
    FROM chapters c
   WHERE c.book_id = p_book_id
     AND c.status = 'published'
   ORDER BY c.order_index, c.created_at, c.id
   LIMIT 1;
$$;

CREATE POLICY chapters_select_preview ON chapters
  FOR SELECT USING (
    status = 'published'
    AND public.is_book_public(book_id)
    AND id = public.book_preview_chapter_id(book_id)
  );
