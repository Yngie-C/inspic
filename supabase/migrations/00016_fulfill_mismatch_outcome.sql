-- ============================================================
-- 00016: fulfill_payment가 확정 실패를 결과로 돌려준다 (코드 리뷰 13-B)
-- ============================================================
--
-- 00005의 fulfill_payment는 금액 불일치·결제 키 불일치에 예외를 던졌습니다.
-- 호출자(lib/payments/fulfillment.ts)는 예외를 "반영됐는지 모름"으로 보고
-- 결제를 취소하지 않은 채 재시도를 기다리는데, 이 두 경우는 다시 불러도
-- 절대 이행되지 않습니다. 그래서 돈은 나가고 책도 환불도 없는 상태로
-- webhook 재시도만 끝없이 돌았습니다(13-P1-11).
--
-- 이제 두 경우는 아무것도 바꾸지 않고 outcome 'mismatch'를 돌려줍니다.
-- 호출자는 열린 구매가 없으면 결제를 취소하고, 있으면 사람이 보게 합니다.
-- 결제 행이 없는 주문은 그대로 던집니다(webhook이 앞에서 2xx로 닫습니다).
--
-- 시그니처가 같으므로 CREATE OR REPLACE가 00005의 REVOKE/GRANT를 그대로
-- 유지합니다.

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

  -- 금액·결제 키가 다르면 몇 번을 다시 불러도 이행할 수 없습니다.
  -- 던지면 호출자는 "반영됐는지 모름"(deferred)으로 보고 재시도만 하므로,
  -- 아무것도 바꾸지 않고 결과로 돌려줘 호출자가 결제를 정리하게 합니다.
  -- purchase_id가 있으면 이 주문으로 이미 책이 열려 있다는 뜻입니다.
  IF v_tx.amount <> p_amount THEN
    RETURN jsonb_build_object(
      'outcome',     'mismatch',
      'reason',      'amount',
      'purchase_id', v_tx.purchase_id,
      'book_id',     v_tx.book_id,
      'user_id',     v_tx.user_id
    );
  END IF;

  IF v_tx.toss_payment_key IS NOT NULL
     AND v_tx.toss_payment_key <> p_payment_key THEN
    RETURN jsonb_build_object(
      'outcome',     'mismatch',
      'reason',      'payment_key',
      'purchase_id', v_tx.purchase_id,
      'book_id',     v_tx.book_id,
      'user_id',     v_tx.user_id
    );
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
