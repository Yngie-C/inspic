-- ============================================================
-- 코드 리뷰 WP5 — 독자 응답 저장
--
-- 1. 챕터를 지워도 독자 답은 남습니다. workbook_responses.chapter_id를
--    ON DELETE SET NULL로 바꿉니다(책 삭제는 그대로 CASCADE).
-- 2. 옮긴 블록의 답을 맞추는 repoint_workbook_responses()가 chapter_id가
--    비어 있는 답도 맞춥니다.
-- 3. workbook_responses를 클라이언트가 직접 써도 서버 판정을 건너뛰지
--    못하게, INSERT/UPDATE 정책이 정의(블록·문항·장)와 값 타입까지 봅니다
--    (코드 리뷰 2-P1-4).
-- 4. 공개 전(draft) 장의 블록·문항은 소유자에게만 보입니다(2-P1-5).
--    응답 쓰기도 같은 기준이라 draft 장의 블록에는 답을 쓸 수 없습니다(3-P1-8).
-- 5. 공백뿐인 답을 미응답(NULL)으로 맞춥니다. 서버가 쓰기 전에 같은
--    정규화를 하므로(3-P1-2) 이미 저장된 행만 한 번 고치고, 직접 쓰기는
--    정책이 막습니다.
-- 6. 독자가 답을 쓴 시각(written_at)을 남깁니다. 리더가 캐시의 미전송
--    답과 서버 값 중 어느 쪽이 최신인지 가릴 때 씁니다.
--
-- 적용: Supabase SQL 에디터 또는 `supabase db push`.
-- 00007이 이미 적용된 프로젝트에 이어서 올리세요.
-- ============================================================

-- ============================================================
-- 1. 챕터 삭제가 독자 답을 지우지 않게
--
-- 판매된 책은 구매자가 계속 읽고 내보냅니다(00006). 저자가 장 하나를
-- 지웠다고 그 장에 독자가 쓴 답까지 CASCADE로 지워지면, 문항을 지웠을 때
-- 답을 남기는 규칙(block_id에 FK가 없는 이유)과 어긋납니다. 장이 사라진
-- 답은 정의가 사라진 답(고아)과 같게 다룹니다.
--
-- WP4에서 남긴 경로 — 블록을 다른 장에 붙여넣고 그 장이 저장되기 전에
-- 원래 장을 지우는 것 — 도 이것으로 막힙니다. 답은 chapter_id가 빈 채
-- 남았다가, 붙여넣은 장이 동기화될 때 아래 repoint가 새 장을 가리키게 합니다.
-- ============================================================

ALTER TABLE workbook_responses ALTER COLUMN chapter_id DROP NOT NULL;

ALTER TABLE workbook_responses
  DROP CONSTRAINT IF EXISTS workbook_responses_chapter_id_fkey;

ALTER TABLE workbook_responses
  ADD CONSTRAINT workbook_responses_chapter_id_fkey
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL;

-- ============================================================
-- 2. repoint_workbook_responses — chapter_id가 빈 답도
--
-- 00007은 `r.chapter_id <> p_chapter_id`로 골랐는데, NULL과의 비교는
-- 참이 아니라서 장이 지워진 답이 빠집니다.
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
     AND r.chapter_id IS DISTINCT FROM p_chapter_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.repoint_workbook_responses(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repoint_workbook_responses(UUID) TO authenticated;

-- ============================================================
-- 3. 이 블록을 지금 사람이 볼 수 있는가
--
-- 책에 접근할 수 있고, 블록이 든 장이 published이거나 본인이 소유자일 때.
-- chapters_select와 같은 기준입니다 — 본문을 못 보는 장의 문항이 따로
-- 보이면 공개 전 질문을 미리 읽을 수 있습니다(2-P1-5).
--
-- SECURITY DEFINER인 것은 정책 안에서 chapters를 다시 RLS로 읽지 않기
-- 위해서입니다. 판정은 auth.uid()를 쓰는 함수들이 합니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_read_workbook_block(
  p_book_id UUID,
  p_chapter_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_book_access(p_book_id)
     AND (
       public.is_book_owner(p_book_id)
       OR EXISTS (
         SELECT 1 FROM chapters c
         WHERE c.id = p_chapter_id
           AND c.book_id = p_book_id
           AND c.status = 'published'
       )
     );
$$;

REVOKE ALL ON FUNCTION public.can_read_workbook_block(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_workbook_block(UUID, UUID) TO anon, authenticated;

DROP POLICY IF EXISTS workbook_blocks_select ON workbook_blocks;
CREATE POLICY workbook_blocks_select ON workbook_blocks
  FOR SELECT USING (public.can_read_workbook_block(book_id, chapter_id));

-- 문항은 소속 블록으로 판정합니다.
CREATE OR REPLACE FUNCTION public.can_read_workbook_block_fields(p_block_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workbook_blocks wb
    WHERE wb.id = p_block_id
      AND public.can_read_workbook_block(wb.book_id, wb.chapter_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_workbook_block_fields(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_workbook_block_fields(UUID) TO anon, authenticated;

DROP POLICY IF EXISTS workbook_block_fields_select ON workbook_block_fields;
CREATE POLICY workbook_block_fields_select ON workbook_block_fields
  FOR SELECT USING (public.can_read_workbook_block_fields(block_id));

-- ============================================================
-- 공백뿐인 글
--
-- 리더의 `isBlankText()`(JS `String.prototype.trim`)와 같은 문자 집합을
-- 명시합니다. `[[:space:]]`는 로케일에 따라 전각 공백(U+3000)·NBSP를
-- 빼먹을 수 있고, 그러면 집계는 "답함", 리더는 "작성 전"으로 셉니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_blank_text(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_text ~ E'^[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]*$';
$$;

-- ============================================================
-- 4. 응답 행이 지금의 정의를 가리키는가
--
-- 00001의 쓰기 정책은 user_id와 has_book_access(book_id)만 봤습니다.
-- 그래서 PostgREST로 직접 넣으면 없는 블록·문항, 다른 책의 chapter_id,
-- 타입이 어긋난 값이 그대로 들어가 workbook_response_stats()에 유령 문항과
-- 부풀린 응답 수가 잡혔습니다(2-P1-4).
--
-- 서버 라우트(PUT /api/books/[bookId]/responses)는 같은 판정을 먼저 하고
-- 어긋난 항목을 `rejected`로 돌려줍니다. 이 함수는 라우트를 건너뛴 쓰기를
-- 막는 마지막 방어선이고, 라우트가 판정한 뒤 저자가 정의를 바꾸는 짧은
-- 틈에만 라우트와 다른 답을 냅니다(그때 라우트는 500, 리더는 다시 보냄).
--
-- 척도의 범위(min/max)는 여기서 보지 않습니다. 범위를 해석하는 규칙은
-- `lib/workbook/block-config.ts` 하나에 두고 라우트가 검사합니다 —
-- SQL에 두 벌을 두면 언젠가 어긋납니다. 정수인지만 봅니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_valid_workbook_response(
  p_book_id UUID,
  p_chapter_id UUID,
  p_block_id UUID,
  p_field_key TEXT,
  p_value_text TEXT,
  p_value_number NUMERIC,
  p_value_bool BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workbook_block_fields f
    JOIN workbook_blocks wb ON wb.id = f.block_id
    WHERE f.block_id = p_block_id
      AND f.field_key = p_field_key
      AND wb.book_id = p_book_id
      AND wb.chapter_id = p_chapter_id
      AND public.can_read_workbook_block(wb.book_id, wb.chapter_id)
      -- 공백뿐인 글은 미응답(NULL)으로 써야 합니다. 그대로 두면 집계에서
      -- "답함"으로 잡힙니다(라우트는 NULL로 바꿔 씁니다).
      AND (p_value_text IS NULL OR NOT public.is_blank_text(p_value_text))
      AND CASE f.input_type
        WHEN 'text' THEN p_value_number IS NULL AND p_value_bool IS NULL
        WHEN 'longtext' THEN p_value_number IS NULL AND p_value_bool IS NULL
        WHEN 'boolean' THEN p_value_text IS NULL AND p_value_number IS NULL
        WHEN 'integer' THEN p_value_text IS NULL AND p_value_bool IS NULL
          AND (p_value_number IS NULL OR p_value_number = trunc(p_value_number))
        ELSE false
      END
  );
$$;

REVOKE ALL ON FUNCTION public.is_valid_workbook_response(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_workbook_response(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, BOOLEAN) TO authenticated;

DROP POLICY IF EXISTS workbook_responses_insert_own ON workbook_responses;
CREATE POLICY workbook_responses_insert_own ON workbook_responses
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.is_valid_workbook_response(
      book_id, chapter_id, block_id, field_key,
      value_text, value_number, value_bool
    )
  );

DROP POLICY IF EXISTS workbook_responses_update_own ON workbook_responses;
CREATE POLICY workbook_responses_update_own ON workbook_responses
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_valid_workbook_response(
      book_id, chapter_id, block_id, field_key,
      value_text, value_number, value_bool
    )
  );

-- ============================================================
-- 5. 공백뿐인 답 정리
--
-- 서버는 이제 공백뿐인 답을 NULL로 저장합니다. isAnswered()와
-- workbook_response_stats()의 answered_count는 둘 다 "값이 NULL이 아님"을
-- 보므로, 예전에 저장된 공백 답만 맞추면 두 판정이 같아집니다.
-- ============================================================

UPDATE workbook_responses
   SET value_text = NULL
 WHERE value_text IS NOT NULL
   AND public.is_blank_text(value_text);

-- ============================================================
-- 6. written_at — 독자가 그 답을 쓴 시각
--
-- 리더는 서버가 받았다고 확인하지 않은 답을 캐시에 "미전송"으로 남기고,
-- 다시 열 때 서버 값과 어느 쪽이 최신인지 가립니다. updated_at으로 가리면
-- 안 됩니다.
--   · 기기 시계(쓴 시각)와 서버 시계(updated_at)를 비교하게 됩니다.
--   · 'ab' 저장 요청이 나가 있는 동안 'abc'를 쓰고 탭을 닫으면, 'ab'가
--     나중에 커밋돼 updated_at이 더 늦습니다 — 'abc'가 집니다.
--   · repoint·장 삭제(SET NULL)·위의 공백 정리도 updated_at을 올립니다.
-- 그래서 리더가 보낸 쓴 시각을 남기고(서버 시각보다 미래면 서버 시각으로
-- 자름), 같은 기기의 시계끼리 비교하게 합니다. 예전 행은 NULL이고 리더는
-- 그때 updated_at을 씁니다.
-- ============================================================

ALTER TABLE workbook_responses ADD COLUMN IF NOT EXISTS written_at TIMESTAMPTZ;
