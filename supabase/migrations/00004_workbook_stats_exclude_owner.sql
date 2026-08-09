-- ============================================================
-- 00004 — 참여 지표에서 저자 본인을 뺍니다
--
-- 미리보기(`PreviewFrame`)가 리더를 그대로 띄우고, 소유자는
-- `canSaveResponses: true`입니다. 그래서 저자가 자기 책을 확인하며 넣은
-- 입력이 실제 응답 행이 됩니다. 그 상태로 세면 독자가 3명일 때 참여율이
-- 25% 부풀고, 최악은 **독자가 0명인데 "1명 응답"으로 보이는 것**입니다.
--
-- 미리보기 저장을 막는 쪽(`canSaveResponses: false`)은 쓰지 않았습니다.
-- 저자가 핵심 루프가 도는지 스스로 확인할 방법이 없어지고, M3에서
-- "의도한 동작"으로 정한 것을 뒤집는 일이기도 합니다. 세는 쪽에서
-- 빼는 것이 되돌리기도 쉽습니다.
--
-- 화면에 "본인 응답은 집계에서 제외됩니다"를 함께 적으세요. 없으면
-- 저자가 자기 책을 테스트하고 0을 보고 고장 난 줄 압니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.workbook_response_stats(p_book_id UUID)
RETURNS TABLE (
  chapter_id UUID,
  block_id UUID,
  field_key TEXT,
  respondent_count BIGINT,
  answered_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NOT public.is_book_owner(p_book_id) THEN
    RAISE EXCEPTION 'not the owner of book %', p_book_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT b.owner_id INTO v_owner_id FROM books b WHERE b.id = p_book_id;

  RETURN QUERY
  SELECT
    r.chapter_id,
    r.block_id,
    r.field_key,
    count(DISTINCT r.user_id) AS respondent_count,
    count(*) FILTER (
      WHERE r.value_text IS NOT NULL
         OR r.value_number IS NOT NULL
         OR r.value_bool IS TRUE
    ) AS answered_count
  FROM workbook_responses r
  WHERE r.book_id = p_book_id
    AND r.user_id <> v_owner_id
  GROUP BY r.chapter_id, r.block_id, r.field_key;
END;
$$;

REVOKE ALL ON FUNCTION public.workbook_response_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workbook_response_stats(UUID) TO authenticated;
