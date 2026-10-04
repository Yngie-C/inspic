-- ============================================================
-- 00010: covers 버킷 — 표지 파일은 책 소유자만 올리고 지운다
--
-- covers 버킷과 그 정책은 지금까지 마이그레이션에 없었고, 대시보드에도
-- 정책이 하나도 없었습니다(2026-10-04 확인). storage.objects는 RLS가
-- 켜져 있어 정책이 없으면 표지 업로드·교체·삭제가 모두 거부됩니다
-- (코드 리뷰 5단계 묶음 D).
--
-- 경로 규약: covers 버킷 안의 covers/{bookId}/{파일명}
-- (`/api/books/[bookId]/cover`). chapter-images와 달리 첫 폴더가 고정
-- 문자열 'covers'이고 책 ID는 두 번째 폴더입니다.
-- ============================================================

-- 1. 버킷
--
-- 공개 버킷입니다. 표지는 탐색 화면에서 누구에게나 보이고, 앱은 공개 URL
-- (getPublicUrl)로 그립니다. 크기·형식은 라우트의 검사와 같은 값입니다
-- (5MB, JPEG·PNG·WebP). 이미 대시보드에서 만든 버킷이 있으면 이 값으로
-- 맞춥니다.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'covers',
  'covers',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. 파일 경로에서 책 ID 꺼내기
--
-- 모양이 맞지 않으면 NULL이고, is_book_owner(NULL)은 false입니다.
-- 정책 안에서 바로 ::uuid로 캐스팅하지 않는 이유는 00006과 같습니다 —
-- 정책은 다른 버킷의 행에도 평가될 수 있고, 거기서 캐스팅이 실패하면
-- 그 버킷의 조회·쓰기까지 에러가 납니다. CASE는 평가 순서를 보장합니다.
CREATE OR REPLACE FUNCTION public.cover_object_book_id(p_name TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] = 'covers'
     AND (storage.foldername(p_name))[2]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN ((storage.foldername(p_name))[2])::uuid
    ELSE NULL
  END;
$$;

-- 3. 정책
--
-- SELECT도 소유자에게만 줍니다. 공개 버킷의 파일은 공개 URL로 정책 없이
-- 내려가므로 리더·탐색 화면에는 필요 없고, 열면 Storage list API로 남의
-- 책 표지 파일 목록이 보입니다. 소유자 SELECT는 Storage의 remove/move/
-- upsert가 함께 요구해서 남깁니다(00006의 chapter-images와 같습니다).
--
-- 책을 지운 뒤의 표지 정리는 service_role(admin)이 하므로 이 정책을
-- 거치지 않습니다(`removeBookFiles()`).
DROP POLICY IF EXISTS covers_select_own ON storage.objects;
DROP POLICY IF EXISTS covers_insert_own ON storage.objects;
DROP POLICY IF EXISTS covers_update_own ON storage.objects;
DROP POLICY IF EXISTS covers_delete_own ON storage.objects;

CREATE POLICY covers_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'covers'
    AND public.is_book_owner(public.cover_object_book_id(name))
  );

CREATE POLICY covers_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'covers'
    AND public.is_book_owner(public.cover_object_book_id(name))
  );

CREATE POLICY covers_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'covers'
    AND public.is_book_owner(public.cover_object_book_id(name))
  )
  WITH CHECK (
    bucket_id = 'covers'
    AND public.is_book_owner(public.cover_object_book_id(name))
  );

CREATE POLICY covers_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'covers'
    AND public.is_book_owner(public.cover_object_book_id(name))
  );
