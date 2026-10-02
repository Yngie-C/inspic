-- ============================================================
-- 코드 리뷰 WP4 — 블록 ID 규칙
--
-- 1. sync_chapter_workbook_blocks가 다른 장·책의 블록을 덮지 않습니다.
--    같은 ID가 두 곳에 있으면 결과의 `conflicts`로 돌려주고 건너뜁니다.
-- 2. 같은 책 안에서 블록을 옮겼으면(원래 장의 본문에 그 ID가 더는 없으면)
--    소속을 옮기고, 그 블록의 독자 답도 새 장을 가리키게 합니다.
-- 3. 페이로드에 같은 블록 ID가 반복되면 문항도 앞의 항목에서만 가져옵니다.
-- 4. 저장할 수 없는 문항 키(비었거나 64자 초과)는 건너뜁니다 — CHECK에
--    걸려 장 전체의 동기화가 롤백되지 않게.
--
-- 적용: Supabase SQL 에디터 또는 `supabase db push`.
-- 00006이 이미 적용된 프로젝트에 이어서 올리세요.
-- ============================================================

-- ============================================================
-- 1. 다른 책이 쓰고 있는 블록 ID
--
-- 다른 사람 책의 블록은 RLS로 보이지 않습니다. 보이지 않는 행과 ID가
-- 겹치면 upsert가 UPDATE 정책에 걸려 동기화 전체가 실패하고, 그 장은
-- 다시는 동기화되지 않았습니다(코드 리뷰 2-P1-3). 그래서 겹치는지만
-- SECURITY DEFINER로 확인합니다.
--
-- 돌려주는 것은 넘겨받은 ID 중 다른 책에 있는 것뿐이고, 그 책이 어디인지는
-- 알려 주지 않습니다. 호출자가 p_book_id의 소유자가 아니면 빈 배열입니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.workbook_block_ids_in_other_books(
  p_book_id UUID,
  p_ids UUID[]
)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(wb.id), ARRAY[]::uuid[])
  FROM workbook_blocks wb
  WHERE public.is_book_owner(p_book_id)
    AND wb.id = ANY (p_ids)
    AND wb.book_id <> p_book_id;
$$;

REVOKE ALL ON FUNCTION public.workbook_block_ids_in_other_books(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workbook_block_ids_in_other_books(UUID, UUID[]) TO authenticated;

-- ============================================================
-- 2. 옮겨 간 블록의 독자 답이 새 장을 가리키게
--
-- workbook_responses.chapter_id에는 FK CASCADE가 있습니다. 블록을 2장으로
-- 옮긴 뒤 1장을 지우면, 옛 chapter_id를 단 독자 답이 함께 지워졌습니다.
-- 답은 독자 본인만 고칠 수 있어서(RLS) SECURITY DEFINER로 맞춥니다.
--
-- 바꾸는 것은 chapter_id 하나이고, 대상은 "지금 이 장에 정의가 있는 블록의
-- 같은 책 답"뿐입니다. 정의가 어디 있는지는 동기화가 정하므로, 이 함수는
-- 답을 정의에 맞추기만 합니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.repoint_workbook_responses(p_chapter_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_book_id UUID;
  v_count INT;
BEGIN
  SELECT c.book_id INTO v_book_id FROM chapters c WHERE c.id = p_chapter_id;
  IF v_book_id IS NULL OR NOT public.is_book_owner(v_book_id) THEN
    RETURN 0;
  END IF;

  UPDATE workbook_responses r
     SET chapter_id = p_chapter_id
    FROM workbook_blocks wb
   WHERE wb.chapter_id = p_chapter_id
     AND wb.book_id = v_book_id
     AND r.block_id = wb.id
     AND r.book_id = v_book_id
     AND r.chapter_id <> p_chapter_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.repoint_workbook_responses(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repoint_workbook_responses(UUID) TO authenticated;

-- ============================================================
-- 3. sync_chapter_workbook_blocks
--
-- 00002의 함수를 바꿉니다. 바뀐 점:
--
-- - 같은 ID의 블록이 이미 다른 곳에 있으면:
--     · 다른 책 → 충돌. 건너뛰고 `conflicts`에 담습니다.
--     · 같은 책의 다른 장이고, 그 장의 본문에 아직 그 ID가 있음 → 복사본.
--       충돌로 건너뜁니다. 예전에는 저장할 때마다 블록이 두 장 사이를
--       오갔고, 한쪽에서 지우면 다른 쪽의 정의까지 사라졌습니다(4-P0-3).
--     · 같은 책의 다른 장이고, 그 장의 본문에 그 ID가 없음 → 옮긴 것.
--       소속을 이 장으로 바꾸고 독자 답도 따라옵니다.
--   에디터가 붙여넣은 블록에 새 ID를 주므로(TemplateNodeIds) 충돌은
--   업로드·직접 편집·장 전환 중 잘라내기 유실 같은 드문 경로에서만 납니다.
--   공개 전 검수가 같은 상태를 차단 사유로 잡습니다.
-- - 페이로드에 같은 블록 ID가 반복되면 앞의 항목 하나만 씁니다. 블록과
--   문항을 모두 그 항목에서 가져옵니다. 예전에는 블록은 앞의 것, 문항은
--   항목마다 섞여서 input_type이 block_type과 어긋날 수 있었습니다.
-- - 문항 키가 비었거나 64자를 넘으면 그 문항만 건너뜁니다.
--
-- 반환값에 `conflicts`(UUID 배열)와 `responses_repointed`가 늘었습니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_chapter_workbook_blocks(
  p_chapter_id UUID,
  p_blocks JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_book_id UUID;
  v_blocks JSONB := COALESCE(p_blocks, '[]'::jsonb);
  v_unique JSONB;
  v_incoming_ids UUID[];
  v_conflicts UUID[];
  v_accepted JSONB;
  v_block_ids UUID[];
  v_blocks_upserted INT := 0;
  v_blocks_removed INT := 0;
  v_fields_upserted INT := 0;
  v_fields_removed INT := 0;
  v_responses_repointed INT := 0;
BEGIN
  IF jsonb_typeof(v_blocks) <> 'array' THEN
    RAISE EXCEPTION 'p_blocks must be a JSON array, got %', jsonb_typeof(v_blocks)
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT c.book_id INTO v_book_id FROM chapters c WHERE c.id = p_chapter_id;

  IF v_book_id IS NULL THEN
    RAISE EXCEPTION 'chapter % not found', p_chapter_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_book_owner(v_book_id) THEN
    RAISE EXCEPTION 'not the owner of the book that owns chapter %', p_chapter_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 같은 ID는 앞의 항목 하나만. 블록과 문항을 모두 이 항목에서 읽습니다.
  SELECT
    COALESCE(jsonb_agg(d.value ORDER BY d.position), '[]'::jsonb),
    COALESCE(array_agg(d.id), ARRAY[]::uuid[])
  INTO v_unique, v_incoming_ids
  FROM (
    SELECT DISTINCT ON ((b.value ->> 'id')::uuid)
      (b.value ->> 'id')::uuid AS id,
      b.value,
      b.ordinality AS position
    FROM jsonb_array_elements(v_blocks) WITH ORDINALITY AS b(value, ordinality)
    ORDER BY (b.value ->> 'id')::uuid, b.ordinality
  ) d;

  -- 다른 곳이 쓰고 있는 ID.
  SELECT COALESCE(array_agg(DISTINCT x.id), ARRAY[]::uuid[])
  INTO v_conflicts
  FROM (
    SELECT unnest(
      public.workbook_block_ids_in_other_books(v_book_id, v_incoming_ids)
    ) AS id
    UNION ALL
    SELECT wb.id
    FROM workbook_blocks wb
    JOIN chapters c ON c.id = wb.chapter_id
    WHERE wb.id = ANY (v_incoming_ids)
      AND wb.book_id = v_book_id
      AND wb.chapter_id <> p_chapter_id
      -- 그 장의 본문에 아직 있으면 복사본, 없으면 옮긴 것.
      AND strpos(lower(c.content_html), wb.id::text) > 0
  ) x;

  SELECT COALESCE(jsonb_agg(u.value ORDER BY u.ordinality), '[]'::jsonb)
  INTO v_accepted
  FROM jsonb_array_elements(v_unique) WITH ORDINALITY AS u(value, ordinality)
  WHERE NOT ((u.value ->> 'id')::uuid = ANY (v_conflicts));

  -- 블록 upsert. 충돌을 위에서 걸렀으므로 ON CONFLICT에 걸리는 것은
  -- 이 장의 블록이거나, 같은 책의 다른 장에서 옮겨 온 블록뿐입니다.
  WITH incoming AS (
    SELECT
      (b.value ->> 'id')::uuid AS id,
      b.value ->> 'block_type' AS block_type,
      COALESCE((b.value ->> 'order_index')::int, 0) AS order_index,
      COALESCE(b.value -> 'config', '{}'::jsonb) AS config
    FROM jsonb_array_elements(v_accepted) AS b(value)
  ), upserted AS (
    INSERT INTO workbook_blocks (
      id, book_id, chapter_id, block_type, order_index, config
    )
    SELECT i.id, v_book_id, p_chapter_id, i.block_type, i.order_index, i.config
    FROM incoming i
    ON CONFLICT (id) DO UPDATE SET
      chapter_id = EXCLUDED.chapter_id,
      block_type = EXCLUDED.block_type,
      order_index = EXCLUDED.order_index,
      config = EXCLUDED.config
    RETURNING id
  )
  SELECT count(*)::int, COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_blocks_upserted, v_block_ids
  FROM upserted;

  -- 이 장에서 사라진 블록. 소속 문항은 FK CASCADE로 함께 지워집니다.
  -- 충돌로 건너뛴 블록은 다른 장의 행이라 여기 걸리지 않습니다.
  DELETE FROM workbook_blocks wb
  WHERE wb.chapter_id = p_chapter_id
    AND NOT (wb.id = ANY (v_block_ids));
  GET DIAGNOSTICS v_blocks_removed = ROW_COUNT;

  -- 문항 upsert. 블록 안에서 같은 키는 앞의 것.
  WITH incoming AS (
    SELECT DISTINCT ON (block_id, field_key)
      block_id, field_key, label, input_type, order_index, position
    FROM (
      SELECT
        (b.value ->> 'id')::uuid AS block_id,
        f.value ->> 'field_key' AS field_key,
        COALESCE(f.value ->> 'label', '') AS label,
        f.value ->> 'input_type' AS input_type,
        COALESCE((f.value ->> 'order_index')::int, 0) AS order_index,
        f.ordinality AS position
      FROM jsonb_array_elements(v_accepted) AS b(value)
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(b.value -> 'fields', '[]'::jsonb)
      ) WITH ORDINALITY AS f(value, ordinality)
    ) parsed
    WHERE block_id = ANY (v_block_ids)
      AND length(field_key) BETWEEN 1 AND 64
    ORDER BY block_id, field_key, position
  ), upserted AS (
    INSERT INTO workbook_block_fields (
      block_id, field_key, label, input_type, order_index
    )
    SELECT i.block_id, i.field_key, i.label, i.input_type, i.order_index
    FROM incoming i
    ON CONFLICT (block_id, field_key) DO UPDATE SET
      label = EXCLUDED.label,
      input_type = EXCLUDED.input_type,
      order_index = EXCLUDED.order_index
    RETURNING id
  )
  SELECT count(*)::int INTO v_fields_upserted FROM upserted;

  -- 살아 있는 블록에서 사라진 문항.
  DELETE FROM workbook_block_fields wf
  WHERE wf.block_id = ANY (v_block_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_accepted) AS b(value)
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(b.value -> 'fields', '[]'::jsonb)
      ) AS f(value)
      WHERE (b.value ->> 'id')::uuid = wf.block_id
        AND f.value ->> 'field_key' = wf.field_key
        AND length(f.value ->> 'field_key') BETWEEN 1 AND 64
    );
  GET DIAGNOSTICS v_fields_removed = ROW_COUNT;

  v_responses_repointed := public.repoint_workbook_responses(p_chapter_id);

  RETURN jsonb_build_object(
    'blocks_upserted', v_blocks_upserted,
    'blocks_removed', v_blocks_removed,
    'fields_upserted', v_fields_upserted,
    'fields_removed', v_fields_removed,
    'responses_repointed', v_responses_repointed,
    'conflicts', to_jsonb(v_conflicts)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_chapter_workbook_blocks(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_chapter_workbook_blocks(UUID, JSONB) TO authenticated;
