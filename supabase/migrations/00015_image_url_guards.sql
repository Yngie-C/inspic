-- ============================================================
-- 00015: 이미지 URL 컬럼은 업로드 라우트만 바꾼다 (코드 리뷰 10-A)
--
-- 표지(cover_image_url)·소개 이미지(detail_image_url)·프로필 사진
-- (avatar_url)은 업로드 라우트로만 바꾼다고 정했지만(00010·00013·00014),
-- 그 규칙을 지키는 것은 책 PUT·프로필 PUT의 거절뿐이었습니다. 소유자
-- UPDATE 정책(books_update_own, user_profiles_update_own)이 행 전체에
-- 열려 있어서, PostgREST를 직접 부르면 아무 외부 URL이나 들어가고 공개
-- 책 상세·저자 페이지가 그것을 <img>로 그렸습니다(10-P1-1·10-P1-2).
--
-- 방식: authenticated·anon 역할이 이 세 컬럼을 바꾸면 트리거가 거절합니다.
-- 업로드 라우트는 소유자 확인을 마친 뒤 그 컬럼만 admin(service_role)
-- 클라이언트로 씁니다. 컬럼 권한 회수(REVOKE + 컬럼별 GRANT)는 컬럼을
-- 더할 때마다 GRANT 목록을 고쳐야 하고 빠뜨리면 저자 저장이 조용히
-- 막혀서, URL 모양 CHECK는 Supabase 호스트가 환경마다 달라 DB가 정답을
-- 몰라서 고르지 않았습니다.
--
-- 같은 이유로 bio 80자도 DB가 지킵니다(10-P2-1).
-- ============================================================

-- 1. URL 컬럼 잠금
--
-- 트리거 인자로 받은 컬럼을 to_jsonb로 비교하므로 함수 하나가 두 테이블을
-- 맡습니다. 같은 값을 다시 쓰는 갱신(다른 컬럼만 바꾸는 저장)은 통과하고,
-- 바꾸거나 비우는 갱신, 값을 들고 오는 INSERT는 거절합니다.
-- handle_new_user()는 SECURITY DEFINER라 이 검사에 걸리지 않고, 애초에
-- avatar_url을 넣지 않습니다.
--
-- current_user로 판정합니다. PostgREST는 요청마다 SET ROLE로 역할을
-- 갈아타므로 사용자 요청은 authenticated/anon, admin 클라이언트는
-- service_role이고, 마이그레이션·대시보드는 테이블 소유자입니다.
CREATE OR REPLACE FUNCTION guard_upload_only_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  col TEXT;
  new_row JSONB := to_jsonb(NEW);
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  FOREACH col IN ARRAY TG_ARGV LOOP
    IF (TG_OP = 'INSERT' AND new_row->>col IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND new_row->col IS DISTINCT FROM to_jsonb(OLD)->col) THEN
      RAISE EXCEPTION '%.%은 업로드 경로로만 바꿀 수 있습니다', TG_TABLE_NAME, col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS books_guard_image_urls ON books;
CREATE TRIGGER books_guard_image_urls
  BEFORE INSERT OR UPDATE ON books
  FOR EACH ROW
  EXECUTE FUNCTION guard_upload_only_columns('cover_image_url', 'detail_image_url');

DROP TRIGGER IF EXISTS user_profiles_guard_avatar_url ON user_profiles;
CREATE TRIGGER user_profiles_guard_avatar_url
  BEFORE INSERT OR UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_upload_only_columns('avatar_url');

-- 2. bio 길이
--
-- NOT VALID: 00014 이전에 쓴 긴 bio는 그대로 두고, 그 행을 고칠 때부터
-- 걸립니다. 프로필 PUT이 이미 80자를 막으므로 화면 동작은 같습니다.
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_bio_length;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_bio_length
    CHECK (bio IS NULL OR char_length(bio) <= 80) NOT VALID;

-- 3. 우리 것이 아닌 avatars 정책 (10-P1-3)
--
-- 00014는 avatars_*_own 네 개만 지웠습니다. 대시보드나 Supabase 스타터가
-- 다른 이름으로 만든 avatars 정책("Anyone can upload an avatar." 등)이
-- 남아 있으면 OR로 합쳐져 남의 폴더가 열립니다. 2026-10-24에 운영
-- pg_policies를 확인했을 때는 우리 정책뿐이었습니다 — 이 블록은 다른
-- 환경(새 프로젝트, 스테이징)을 위한 방어입니다.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname NOT IN (
        'avatars_select_own', 'avatars_insert_own',
        'avatars_update_own', 'avatars_delete_own'
      )
      AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%''avatars''%'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
  END LOOP;
END;
$$;
