-- ============================================================
-- 00017: 공개 상태는 검수를 거친 라우트만 바꾼다 (코드 리뷰 11-C)
--
-- 책 공개는 서버 검수(loadPublishChecks)를 거친다고 정했지만, 그 규칙을
-- 지키는 것은 책 PUT 라우트뿐이었습니다. books_update_own이 행 전체에
-- 열려 있어서 PostgREST로 `{status:'published', visibility:'public'}`을
-- 직접 보내면 검수 없이 공개되고, `unlisted`·`processing`·아무
-- `published_at`도 들어갔습니다(11-P1-1). 한 번 출간한 책의 장 공개
-- 전환(WP7)도 같은 구멍입니다.
--
-- 방식은 00015와 같습니다(11단계 결정 1). authenticated·anon 역할이 공개
-- 상태 컬럼을 바꾸면 트리거가 42501로 거절하고, 라우트는 소유자 확인과
-- 검수를 마친 뒤 admin(service_role) 클라이언트로 씁니다. 검수 로직이
-- TS에 있어 SQL만으로 판정할 수 없으니, DB는 "사용자 권한으로는 못
-- 바꾼다"만 지킵니다.
--
-- 같은 이유로 책·장 제목과 소개글 길이도 DB가 지킵니다(11-P2-6·P2-7).
-- ============================================================

-- 1. 책 공개 상태 잠금
--
-- 새 책은 초안·비공개·출간일 없음으로만 만들 수 있습니다(POST
-- /api/books와 업로드가 그렇게 만듭니다). 그 뒤 status·visibility·
-- published_at을 바꾸는 것은 admin 경로뿐입니다. 같은 값을 다시 쓰는
-- 갱신(제목만 고치는 저장)은 통과합니다.
CREATE OR REPLACE FUNCTION guard_book_publish_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft'
       OR NEW.visibility <> 'private'
       OR NEW.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'books의 새 책은 초안·비공개로만 만들 수 있습니다'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.visibility IS DISTINCT FROM OLD.visibility
     OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'books의 공개 상태는 공개 경로로만 바꿀 수 있습니다'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS books_guard_publish_state ON books;
CREATE TRIGGER books_guard_publish_state
  BEFORE INSERT OR UPDATE ON books
  FOR EACH ROW
  EXECUTE FUNCTION guard_book_publish_state();

-- 2. 장 공개 상태 잠금
--
-- 라우트와 같은 범위만 잠급니다. 출간한 적 없는 책(published_at 없음)의
-- 장은 검수 없이 오가므로 그대로 둡니다 — 책을 처음 공개할 때 책 전체를
-- 검수합니다. 출간한 적 있는 책은 내린 뒤에도 산 독자가 published 장을
-- 읽으므로(00006), 그 책의 장을 공개로 만들거나 상태를 바꾸는 것은 admin
-- 경로뿐입니다. draft 장을 더하는 것(장 추가의 기본값)은 막지 않습니다.
--
-- SECURITY INVOKER입니다. DEFINER로 두면 current_user가 함수 소유자가
-- 되어 판정이 무너집니다. 책 행은 chapters RLS가 이미 소유자로 좁혀
-- 놓아서 사용자 권한으로 읽힙니다.
CREATE OR REPLACE FUNCTION guard_chapter_publish_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.status = 'draft')
     OR (TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM books
    WHERE id = NEW.book_id AND published_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'chapters의 공개 상태는 공개 경로로만 바꿀 수 있습니다'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chapters_guard_publish_state ON chapters;
CREATE TRIGGER chapters_guard_publish_state
  BEFORE INSERT OR UPDATE ON chapters
  FOR EACH ROW
  EXECUTE FUNCTION guard_chapter_publish_state();

-- 3. 길이 상한
--
-- 라우트(authoring-input.ts)와 같은 값입니다. 2026-10-27 운영 DB에서 책
-- 제목 최대 17자, 장 제목 17자, 소개글 87자, 80자 넘는 bio 0건을 확인해서
-- 처음부터 VALID로 겁니다(11단계 결정 2·3).
ALTER TABLE books DROP CONSTRAINT IF EXISTS books_title_length;
ALTER TABLE books
  ADD CONSTRAINT books_title_length CHECK (char_length(title) <= 200);

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_description_length;
ALTER TABLE books
  ADD CONSTRAINT books_description_length
    CHECK (description IS NULL OR char_length(description) <= 2000);

ALTER TABLE chapters DROP CONSTRAINT IF EXISTS chapters_title_length;
ALTER TABLE chapters
  ADD CONSTRAINT chapters_title_length CHECK (char_length(title) <= 200);

-- 00015가 NOT VALID로 건 bio 80자를 굳힙니다.
ALTER TABLE user_profiles VALIDATE CONSTRAINT user_profiles_bio_length;
