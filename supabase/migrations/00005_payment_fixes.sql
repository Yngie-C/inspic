-- ============================================================
-- 코드 리뷰 WP2 — 결제 무결성
--
-- 1. 결제 행을 클라이언트가 만들지 못하게 막고, 서버 RPC 하나로만
--    만듭니다. 금액은 RPC가 books.price에서 정합니다.
-- 2. 구매가 지금 어느 결제에 묶여 있는지 기록합니다
--    (purchases.payment_transaction_id).
-- 3. void_payment는 그 구매를 마지막으로 이행한 결제일 때만 회수합니다.
-- 4. fulfill_payment는 종결된 결제 행을 이행하지 않고, 회수된 구매를
--    가리키는 승인 결제는 되살립니다.
--
-- 적용: Supabase SQL 에디터 또는 `supabase db push`.
-- 00004가 이미 적용된 프로젝트에 이어서 올리세요.
-- ============================================================

-- ============================================================
-- 1. 결제 행의 생성 경로를 서버 하나로 고정
--
-- payment_transactions_insert_own은 `auth.uid() = user_id`만 봤습니다.
-- 금액·상태·purchase_id를 클라이언트가 정할 수 있었고, 3만 원짜리
-- 책에 amount 100인 행을 넣고 Toss로 100원을 결제하면 confirm과
-- fulfill_payment의 금액 대조(행 금액 = 승인 금액)를 그대로 통과해
-- 구매가 생겼습니다. 비공개·미발행 책도 같은 방식으로 열렸습니다.
--
-- 00003이 purchases INSERT를 봉인한 것과 같은 방식입니다. 결제 행은
-- create_payment_request() 하나로만 만들고, 이 함수는 service_role만
-- 실행합니다.
-- ============================================================

DROP POLICY IF EXISTS payment_transactions_insert_own ON payment_transactions;

-- ============================================================
-- create_payment_request — 결제 요청 행 생성
--
-- 금액은 인자로 받지 않습니다. 이 함수가 books.price를 읽어 잠급니다.
-- 팔 수 있는 책인지도 여기서 봅니다 — 같은 트랜잭션 안에서 읽어야
-- 확인과 생성 사이에 가격이나 공개 상태가 바뀌는 틈이 없습니다.
--
-- 사용자는 인자로 받습니다. 호출자(서버)가 세션에서 꺼낸 값입니다.
--
-- 반환: { outcome, transaction_id?, amount?, title? }
--   created        결제 행을 만들었습니다
--   not_found      책이 없습니다
--   own_book       자기 책입니다
--   not_for_sale   공개 발행본이 아닙니다
--   free           무료 책입니다
--   already_owned  이미 구매한 책입니다
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_payment_request(
  p_user_id  UUID,
  p_book_id  UUID,
  p_order_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_book books%ROWTYPE;
  v_tx_id UUID;
BEGIN
  SELECT * INTO v_book FROM books WHERE id = p_book_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  IF v_book.owner_id = p_user_id THEN
    RETURN jsonb_build_object('outcome', 'own_book');
  END IF;

  IF v_book.status <> 'published' OR v_book.visibility <> 'public' THEN
    RETURN jsonb_build_object('outcome', 'not_for_sale');
  END IF;

  IF v_book.price = 0 THEN
    RETURN jsonb_build_object('outcome', 'free');
  END IF;

  IF EXISTS (
    SELECT 1 FROM purchases p
     WHERE p.user_id = p_user_id
       AND p.book_id = p_book_id
       AND p.status = 'completed'
  ) THEN
    RETURN jsonb_build_object('outcome', 'already_owned');
  END IF;

  INSERT INTO payment_transactions (user_id, book_id, toss_order_id, amount, status)
  VALUES (p_user_id, p_book_id, p_order_id, v_book.price, 'ready')
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'outcome',        'created',
    'transaction_id', v_tx_id,
    'amount',         v_book.price,
    'title',          v_book.title
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_request(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_payment_request(UUID, UUID, TEXT) FROM anon, authenticated;

-- ============================================================
-- 2. 구매를 마지막으로 이행한 결제
--
-- 환불 뒤 재구매하면 UNIQUE(user_id, book_id) 때문에 같은 purchases
-- 행이 되살아납니다. 옛 결제 행도 여전히 그 purchase_id를 가리키므로,
-- 옛 결제의 취소 webhook이 재전송되면 void_payment가 새로 산 구매를
-- 'refunded'로 바꿨습니다. 돈을 낸 재구매가 닫혔습니다.
--
-- 구매 쪽에 "지금 이 구매를 열어 준 결제"를 남기고, 회수는 그 결제의
-- 취소일 때만 합니다. 옛 결제 행의 purchase_id는 지우지 않습니다 —
-- 무엇이 있었는지는 남겨 둡니다.
-- ============================================================

ALTER TABLE purchases
  ADD COLUMN payment_transaction_id UUID
    REFERENCES payment_transactions(id) ON DELETE SET NULL;

-- 이미 있는 구매는 그 구매에 연결된 결제 중 승인 상태인 것, 없으면
-- 가장 최근에 갱신된 것으로 채웁니다.
UPDATE purchases p
   SET payment_transaction_id = (
     SELECT t.id
       FROM payment_transactions t
      WHERE t.purchase_id = p.id
      ORDER BY (t.status = 'done') DESC, t.updated_at DESC, t.id
      LIMIT 1
   );

-- ============================================================
-- 3. fulfill_payment — 승인된 결제를 구매로 반영 (00003을 대체)
--
-- 바뀐 것:
--
-- (a) 종결된 결제 행은 이행하지 않습니다. 성공 화면이 Toss에서 DONE을
--     받은 뒤 RPC를 부르기 전에 결제가 취소되고 취소 webhook이 먼저
--     반영되면, 예전 함수는 취소된 결제로 구매를 만들고 행을 'done'으로
--     덮었습니다. 환불된 결제로 책이 열리고 취소 기록은 사라졌습니다.
--     이제 'voided'를 돌려주고, 호출자가 Toss 취소로 마무리합니다
--     (이미 취소된 결제라면 Toss가 "이미 취소됨"으로 답합니다).
--
-- (b) 이미 이행한 결제인데 구매가 닫혀 있으면 되살립니다. 호출자는
--     Toss가 지금 DONE이라고 답한 결제만 넘깁니다. 돈이 나간 결제가
--     가리키는 구매가 닫혀 있다면 그것이 잘못된 상태이고, 예전에는
--     already_fulfilled를 돌려줘 아무도 모르게 남았습니다.
--
-- (c) 구매에 이 결제를 연결합니다 (purchases.payment_transaction_id).
--
-- 금액은 여전히 결제 행에 잠근 값과 대조합니다. 행은 이제 서버만
-- books.price로 만들므로, 승인 시점의 책 가격과 다시 비교하지는
-- 않습니다 — 결제창을 연 사이에 가격이 바뀌면 정상 결제가 막힙니다.
--
-- 반환: { outcome, purchase_id, book_id, user_id, status? }
--   granted            새로 구매를 열었습니다
--   restored           이 결제가 가리키는 구매가 닫혀 있어 다시 열었습니다
--   already_fulfilled  이 결제는 이미 반영돼 있습니다
--   duplicate_purchase 다른 결제가 이미 이 책을 열어 줬습니다.
--                      아무것도 바꾸지 않았으니 호출자가 이번 결제를
--                      취소해야 합니다
--   voided             결제 행이 이미 취소·중단·만료 상태입니다.
--                      아무것도 바꾸지 않았습니다. status에 행 상태가
--                      실립니다
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
  -- 것이 정상 경로입니다.
  SELECT * INTO v_tx
    FROM payment_transactions
   WHERE toss_order_id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment transaction not found: %', p_order_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_tx.amount <> p_amount THEN
    RAISE EXCEPTION 'amount mismatch for %: locked %, approved %',
      p_order_id, v_tx.amount, p_amount
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_tx.toss_payment_key IS NOT NULL
     AND v_tx.toss_payment_key <> p_payment_key THEN
    RAISE EXCEPTION 'payment key mismatch for %', p_order_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- (a) 부분 취소는 접근을 유지하므로(void_payment 참고) 이미 연결된
  -- 구매가 있으면 아래 (b)로 넘깁니다. 연결된 구매가 없는 부분 취소는
  -- 열어 준 적 없는 결제의 취소라 다른 종결 상태와 같게 다룹니다.
  IF v_tx.status IN ('canceled', 'aborted', 'expired')
     OR (v_tx.status = 'partial_canceled' AND v_tx.purchase_id IS NULL) THEN
    RETURN jsonb_build_object(
      'outcome',     'voided',
      'status',      v_tx.status,
      'purchase_id', v_tx.purchase_id,
      'book_id',     v_tx.book_id,
      'user_id',     v_tx.user_id
    );
  END IF;

  -- (b) 이미 이행한 결제
  IF v_tx.purchase_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM purchases
     WHERE id = v_tx.purchase_id
       FOR UPDATE;

    IF FOUND AND v_existing.status = 'completed' THEN
      RETURN jsonb_build_object(
        'outcome',     'already_fulfilled',
        'purchase_id', v_tx.purchase_id,
        'book_id',     v_tx.book_id,
        'user_id',     v_tx.user_id
      );
    END IF;

    -- 구매 행이 남아 있으면 되살리고, 지워졌으면 아래에서 새로 만듭니다.
    IF FOUND THEN
      UPDATE purchases
         SET status                 = 'completed',
             payment_transaction_id = v_tx.id
       WHERE id = v_existing.id;

      RETURN jsonb_build_object(
        'outcome',     'restored',
        'purchase_id', v_existing.id,
        'book_id',     v_tx.book_id,
        'user_id',     v_tx.user_id
      );
    END IF;
  END IF;

  SELECT * INTO v_existing
    FROM purchases
   WHERE purchases.user_id = v_tx.user_id
     AND purchases.book_id = v_tx.book_id
     FOR UPDATE;

  -- 다른 결제가 이미 이 책을 열어 줬습니다 (탭 두 개에서 각각 결제).
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
  -- 합니다. 구매를 연 결제도 이번 결제로 바꿉니다.
  INSERT INTO purchases (user_id, book_id, price_paid, payment_method, status,
                         payment_transaction_id)
  VALUES (v_tx.user_id, v_tx.book_id, p_amount, p_method, 'completed', v_tx.id)
      ON CONFLICT (user_id, book_id) DO UPDATE
     SET status                 = 'completed',
         price_paid             = EXCLUDED.price_paid,
         payment_method         = EXCLUDED.payment_method,
         payment_transaction_id = EXCLUDED.payment_transaction_id,
         purchased_at           = now()
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
-- 4. void_payment — 취소·만료·환불을 접근 권한에 반영 (00003을 대체)
--
-- 바뀐 것:
--
-- (a) 구매를 회수하는 것은 그 구매를 지금 열어 준 결제가 취소됐을
--     때뿐입니다 (위 2번).
--
-- (b) 승인 전 상태('aborted', 'expired')로는 승인을 거친 결제 행을
--     덮지 않습니다. Toss에서 DONE이 ABORTED·EXPIRED로 바뀌는 일은
--     없으므로, 그런 요청은 우리가 승인 실패를 잘못 판정한 것입니다.
--     덮으면 멀쩡한 결제의 기록이 사라집니다.
--
-- 반환: { outcome, purchase_id, revoked }
--   voided   결제 행에 반영했습니다
--   ignored  승인을 거친 결제 행이라 승인 전 상태로 덮지 않았습니다
-- ============================================================

CREATE OR REPLACE FUNCTION public.void_payment(
  p_order_id TEXT,
  p_status   TEXT,
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

  IF p_status IN ('aborted', 'expired')
     AND v_tx.status IN ('done', 'canceled', 'partial_canceled') THEN
    RETURN jsonb_build_object(
      'outcome',     'ignored',
      'purchase_id', v_tx.purchase_id,
      'revoked',     false
    );
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
       AND status = 'completed'
       AND payment_transaction_id = v_tx.id;
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

-- 테스트 하네스에는 service_role이 없으므로 있을 때만 겁니다 (00003 참고).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_payment_request(UUID, UUID, TEXT) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fulfill_payment(TEXT, TEXT, INTEGER, TEXT, JSONB) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.void_payment(TEXT, TEXT, JSONB) TO service_role';
  END IF;
END;
$$;
