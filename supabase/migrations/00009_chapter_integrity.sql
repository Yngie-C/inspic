-- ============================================================
-- 코드 리뷰 WP6 — 저작 저장과 챕터 API
--
-- 1. 챕터가 published가 되는 순간 published_at을 DB가 찍습니다.
--    예전에는 PUT이 status를 다시 published로 보낼 때만 찍어, 처음부터
--    published로 만든 장은 출간일이 영원히 비어 있었습니다(4-P1-9).
-- 2. books.total_words / total_chapters를 장이 바뀔 때마다 published 장
--    기준으로 다시 셉니다(4-P1-10). 라우트가 읽은 값에 차이를 더해 덮던
--    방식은 동시 저장에서 갱신을 잃었고, 장 삭제는 글자 수를 빼지 않았고,
--    draft 장까지 세었습니다.
-- 3. 본문 UPDATE와 블록 동기화 사이에 다른 저장이 끼면 옛 본문의 정의로
--    덮지 않고 건너뜁니다(4-P1-13). 늦게 끝난 동기화가 먼저 저장된 본문의
--    정의를 남기면, 본문은 B인데 정의는 A가 됩니다.
--
-- 적용: Supabase SQL 에디터 또는 `supabase db push`.
-- 00008이 이미 적용된 프로젝트에 이어서 올리세요.
-- ============================================================

-- ============================================================
-- 1. 장 출간 시각
--
-- 비어 있을 때만 채웁니다. 장을 draft로 내렸다 다시 올려도 처음 공개한
-- 시각이 밀리지 않습니다(책의 published_at과 같은 규칙).
-- ============================================================

CREATE OR REPLACE FUNCTION public.stamp_chapter_published_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stamp_chapters_published_at
  BEFORE INSERT OR UPDATE OF status, published_at ON chapters
  FOR EACH ROW EXECUTE FUNCTION public.stamp_chapter_published_at();

-- 이미 published인데 출간일이 없는 장. 언제 공개됐는지 알 수 없으니
-- 만든 시각으로 둡니다.
UPDATE chapters
SET published_at = created_at
WHERE status = 'published' AND published_at IS NULL;

-- ============================================================
-- 2. 책 집계
--
-- 독자가 보는 숫자(상세 페이지의 "N장", "약 N분", explore의 분량 정렬)라
-- published 장만 셉니다.
--
-- 책 행을 먼저 잠그고 나서 셉니다. READ COMMITTED에서는 문장마다 새
-- 스냅샷을 쓰므로, 잠금을 기다린 뒤의 SUM은 앞서 커밋된 다른 장의 저장을
-- 봅니다. 잠그지 않으면 두 장을 동시에 저장할 때 서로 상대의 옛 값으로
-- 세어 마지막 쓰기가 틀린 합을 남깁니다.
--
-- SECURITY DEFINER인 이유: 책 행 잠금(FOR UPDATE)과 갱신은 RLS의 UPDATE
-- 정책을 거칩니다. 장을 쓸 수 있는 사람은 책 소유자뿐이라 지금은
-- 걸리지 않지만, 집계가 정책 변경에 따라 조용히 멈추지 않게 합니다.
-- 트리거 함수라 RPC로 직접 부를 수 없습니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_book_totals(p_book_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_words INT;
  v_chapters INT;
BEGIN
  PERFORM 1 FROM books WHERE id = p_book_id FOR UPDATE;
  -- 책이 지워지는 중이면(CASCADE) 고칠 행이 없습니다.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(word_count), 0)::int, count(*)::int
  INTO v_words, v_chapters
  FROM chapters
  WHERE book_id = p_book_id AND status = 'published';

  -- 값이 같으면 쓰지 않습니다. 본문만 고친 저장마다 books.updated_at이
  -- 밀리지 않게 합니다.
  UPDATE books
  SET total_words = v_words, total_chapters = v_chapters
  WHERE id = p_book_id
    AND (total_words IS DISTINCT FROM v_words
      OR total_chapters IS DISTINCT FROM v_chapters);
END;
$$;

-- Supabase는 public의 함수에 anon/authenticated 실행 권한을 기본으로 줍니다.
-- PUBLIC만 거두면 그 권한이 남아, 누구나 남의 책 행을 잠글 수 있습니다.
REVOKE ALL ON FUNCTION public.refresh_book_totals(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_book_totals_on_chapter_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.refresh_book_totals(OLD.book_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE')
    AND (TG_OP = 'INSERT' OR NEW.book_id IS DISTINCT FROM OLD.book_id) THEN
    PERFORM public.refresh_book_totals(NEW.book_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_book_totals_on_chapter_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER refresh_books_totals
  AFTER INSERT OR DELETE OR UPDATE OF word_count, status, book_id ON chapters
  FOR EACH ROW EXECUTE FUNCTION public.refresh_book_totals_on_chapter_change();

-- 지금까지 어긋난 집계를 한 번 맞춥니다.
UPDATE books b
SET total_words = t.words, total_chapters = t.chapters
FROM (
  SELECT
    bk.id,
    COALESCE(SUM(c.word_count) FILTER (WHERE c.status = 'published'), 0)::int AS words,
    (count(c.id) FILTER (WHERE c.status = 'published'))::int AS chapters
  FROM books bk
  LEFT JOIN chapters c ON c.book_id = bk.id
  GROUP BY bk.id
) t
WHERE b.id = t.id
  AND (b.total_words IS DISTINCT FROM t.words
    OR b.total_chapters IS DISTINCT FROM t.chapters);

-- ============================================================
-- 3. 지금 본문일 때만 블록 동기화
--
-- 라우트는 저장한 본문에서 블록을 뽑아 이 함수를 부르면서, 그 본문의
-- SHA-256을 함께 넘깁니다. 장 행을 잠근 채 지금 DB의 본문과 대조하고,
-- 다르면 그 사이 다른 저장이 끼었다는 뜻이므로 아무것도 쓰지 않고
-- `stale`을 돌려줍니다. 끼어든 저장이 자기 본문으로 동기화합니다.
--
-- 잠금은 동기화가 끝날 때까지 유지되므로, 대조를 통과한 뒤 본문이 바뀌는
-- 일은 없습니다(장 UPDATE가 같은 행 잠금을 기다립니다).
--
-- 동기화 본체는 00007의 sync_chapter_workbook_blocks 그대로입니다.
-- 두 벌 두지 않습니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_chapter_workbook_blocks_if_current(
  p_chapter_id UUID,
  p_blocks JSONB,
  p_content_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_digest TEXT;
BEGIN
  SELECT encode(sha256(convert_to(c.content_html, 'UTF8')), 'hex')
  INTO v_digest
  FROM chapters c
  WHERE c.id = p_chapter_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chapter % not found', p_chapter_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_digest IS DISTINCT FROM lower(p_content_sha256) THEN
    RETURN jsonb_build_object('stale', true);
  END IF;

  RETURN public.sync_chapter_workbook_blocks(p_chapter_id, p_blocks);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_chapter_workbook_blocks_if_current(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_chapter_workbook_blocks_if_current(UUID, JSONB, TEXT) TO authenticated;
