-- ============================================================
-- 00011: 책 목차 — 사지 않은 독자에게도 공개된 장의 제목을 보여 준다
--
-- 장 행은 RLS(chapters_select, chapters_select_preview)가 열람 권한대로
-- 보여 줍니다. 유료 책을 사지 않은 독자에게는 미리보기 장 하나만 보여서,
-- 상세 화면이 "구성 12장"인데 목차에는 1장만 나왔습니다 — 사려는 사람이
-- 무엇을 사는지 볼 수 없었습니다(코드 리뷰 7-P1-8, 2026-10-04 결정).
--
-- 정책을 넓히지 않고 함수로 엽니다. chapters SELECT를 넓히면 본문
-- (content_html)까지 열려 유료 콘텐츠가 공짜가 됩니다. 이 함수는 목차에
-- 필요한 열만 돌려주고 본문은 돌려주지 않습니다.
--
-- 돌려주는 것: 책이 공개 발행본이거나(is_book_public) 호출자가 그 책에
-- 접근할 수 있을 때(has_book_access — 소유자·구매자), published 장만.
-- draft 장은 소유자에게도 돌려주지 않습니다. 소유자의 편집용 목록은
-- 기존처럼 chapters를 직접 읽습니다.
--
-- 순서는 book_preview_chapter_id()와 같은 기준(order_index, created_at,
-- id)이라, 첫 행이 곧 미리보기 장입니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.book_table_of_contents(p_book_id UUID)
RETURNS TABLE (
  id UUID,
  book_id UUID,
  title TEXT,
  slug TEXT,
  order_index INTEGER,
  word_count INTEGER,
  estimated_reading_time INTEGER,
  status TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.book_id, c.title, c.slug, c.order_index, c.word_count,
         c.estimated_reading_time, c.status, c.published_at, c.created_at,
         c.updated_at
    FROM chapters c
   WHERE c.book_id = p_book_id
     AND c.status = 'published'
     AND (public.is_book_public(p_book_id) OR public.has_book_access(p_book_id))
   ORDER BY c.order_index, c.created_at, c.id;
$$;

REVOKE ALL ON FUNCTION public.book_table_of_contents(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_table_of_contents(UUID) TO anon, authenticated;
