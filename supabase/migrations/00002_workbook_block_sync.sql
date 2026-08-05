-- ============================================================
-- M2 — 워크북 저작 경로
--
-- 1. 챕터 저장 시 블록 정의를 동기화하는 RPC
-- 2. 에디터 본문 이미지용 Storage 버킷
--
-- 적용: Supabase SQL 에디터 또는 `supabase db push`.
-- 00001이 이미 적용된 프로젝트에 이어서 올리세요.
-- ============================================================

-- ============================================================
-- 1. sync_chapter_workbook_blocks
--
-- 챕터 HTML에서 뽑은 블록 정의를 workbook_blocks /
-- workbook_block_fields에 반영합니다. 저작 측의 유일한 쓰기 경로입니다.
--
-- 한 함수 안에서 처리하는 이유는 트랜잭션입니다. 챕터 저장은 3초
-- 디바운스로 자주 일어나는데, upsert와 삭제를 여러 번의 왕복으로
-- 나누면 중간에 실패했을 때 블록은 새 정의, 문항은 옛 정의인 상태로
-- 남고 다음 저장 전까지 복구되지 않습니다.
--
-- SECURITY INVOKER입니다. 권한 판정은 이 함수가 아니라 각 테이블의
-- RLS가 합니다. 아래 소유자 확인은 권한의 원천이 아니라, 정책에
-- 걸려 0행이 조용히 처리되는 대신 분명한 에러를 내기 위한 것입니다.
--
-- p_blocks는 extractWorkbookBlocks()의 결과 그대로입니다:
--   [{ id, block_type, order_index, config, fields: [{ field_key,
--      label, input_type, order_index }] }]
--
-- 응답(workbook_responses)은 건드리지 않습니다. 크리에이터가 문항을
-- 지워도 독자가 쓴 내용은 남아야 하고, 그래서 block_id에 FK가 없습니다.
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
  v_block_ids UUID[];
  v_blocks_upserted INT := 0;
  v_blocks_removed INT := 0;
  v_fields_upserted INT := 0;
  v_fields_removed INT := 0;
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

  -- 블록 upsert.
  --
  -- DISTINCT ON은 방어입니다. 같은 id가 payload에 두 번 들어오면
  -- ON CONFLICT가 "cannot affect row a second time"으로 터지는데,
  -- 그러면 챕터 저장 전체가 실패합니다. 중복 ID는 에디터의 ProseMirror
  -- 플러그인이 갈라 주지만, 그 방어선이 뚫려도 저장은 살아남게 합니다.
  WITH incoming AS (
    SELECT DISTINCT ON (id)
      id, block_type, order_index, config, position
    FROM (
      SELECT
        (b.value ->> 'id')::uuid AS id,
        b.value ->> 'block_type' AS block_type,
        COALESCE((b.value ->> 'order_index')::int, 0) AS order_index,
        COALESCE(b.value -> 'config', '{}'::jsonb) AS config,
        b.ordinality AS position
      FROM jsonb_array_elements(v_blocks) WITH ORDINALITY AS b(value, ordinality)
    ) parsed
    ORDER BY id, position
  ), upserted AS (
    INSERT INTO workbook_blocks (
      id, book_id, chapter_id, block_type, order_index, config
    )
    SELECT i.id, v_book_id, p_chapter_id, i.block_type, i.order_index, i.config
    FROM incoming i
    ON CONFLICT (id) DO UPDATE SET
      book_id = EXCLUDED.book_id,
      chapter_id = EXCLUDED.chapter_id,
      block_type = EXCLUDED.block_type,
      order_index = EXCLUDED.order_index,
      config = EXCLUDED.config
    RETURNING id
  )
  SELECT count(*)::int, COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_blocks_upserted, v_block_ids
  FROM upserted;

  -- 이 챕터에서 사라진 블록. 소속 문항은 FK CASCADE로 함께 지워집니다.
  -- 다른 챕터로 옮겨 간 블록은 위 upsert에서 chapter_id가 이미 바뀌었으므로
  -- 여기 걸리지 않습니다.
  DELETE FROM workbook_blocks wb
  WHERE wb.chapter_id = p_chapter_id
    AND NOT (wb.id = ANY (v_block_ids));
  GET DIAGNOSTICS v_blocks_removed = ROW_COUNT;

  -- 문항 upsert.
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
      FROM jsonb_array_elements(v_blocks) AS b(value)
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(b.value -> 'fields', '[]'::jsonb)
      ) WITH ORDINALITY AS f(value, ordinality)
    ) parsed
    WHERE block_id = ANY (v_block_ids)
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
      FROM jsonb_array_elements(v_blocks) AS b(value)
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(b.value -> 'fields', '[]'::jsonb)
      ) AS f(value)
      WHERE (b.value ->> 'id')::uuid = wf.block_id
        AND f.value ->> 'field_key' = wf.field_key
    );
  GET DIAGNOSTICS v_fields_removed = ROW_COUNT;

  RETURN jsonb_build_object(
    'blocks_upserted', v_blocks_upserted,
    'blocks_removed', v_blocks_removed,
    'fields_upserted', v_fields_upserted,
    'fields_removed', v_fields_removed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_chapter_workbook_blocks(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_chapter_workbook_blocks(UUID, JSONB) TO authenticated;

-- ============================================================
-- 2. chapter-images 버킷 — 에디터 본문 이미지
--
-- 커버(covers)와 분리한 이유는 수명주기가 다르기 때문입니다. 커버는
-- 책당 하나이고 교체되지만, 본문 이미지는 여러 장이고 챕터를 지울 때
-- 함께 정리해야 합니다.
--
-- 경로 규약: {bookId}/{chapterId}/{파일명}
-- 정책이 첫 번째 폴더를 책 ID로 읽어 소유권을 판정하므로 이 순서를
-- 바꾸지 마세요.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chapter-images',
  'chapter-images',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 읽기는 공개입니다. 유료 책 본문이라도 이미지 URL 자체는 추측 불가능한
-- 파일명으로 보호되며, 접근 제어의 방어선은 챕터 본문(RLS)입니다.
-- 여기서 막으면 리더가 이미지를 그리지 못합니다.
CREATE POLICY chapter_images_select_public ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'chapter-images');

CREATE POLICY chapter_images_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chapter-images'
    AND public.is_book_owner(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY chapter_images_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chapter-images'
    AND public.is_book_owner(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'chapter-images'
    AND public.is_book_owner(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY chapter_images_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chapter-images'
    AND public.is_book_owner(((storage.foldername(name))[1])::uuid)
  );
