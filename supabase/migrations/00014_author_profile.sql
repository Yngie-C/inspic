-- ============================================================
-- 00014: 저자 프로필 — 긴 이력과 프로필 사진 업로드
--
-- 저자 페이지에는 이름과 소개 한 덩어리뿐이라 "해 본 사람"이 무엇을
-- 해 왔는지 보여 줄 자리가 없었습니다(2026-10-21). bio는 랜딩·탐색
-- 카드가 이미 "현장 이력 한 줄"로 쓰고 있어 한 줄 소개로 두고, 긴
-- 이력은 about에 둡니다. bio의 길이 상한(80자)은 라우트만 검사합니다
-- — 이전에 쓴 긴 bio가 있을 수 있어서 CHECK를 걸지 않습니다.
--
-- 프로필 사진은 지금까지 아무 URL이나 직접 입력했습니다. avatars
-- 버킷에 올리고 URL은 `/api/my/avatar` 업로드로만 바꿉니다(프로필
-- PUT은 avatar_url을 거절합니다 — 표지와 같은 이유).
--
-- user_profiles 정책은 추가하지 않습니다. 기존 user_profiles_update_own
-- (본인)이 about도 덮습니다.
-- ============================================================

-- 1. 긴 이력
ALTER TABLE user_profiles
  ADD COLUMN about TEXT
    CHECK (about IS NULL OR char_length(about) <= 2000);

-- 2. 버킷
--
-- 공개 버킷입니다. 저자 페이지·책 상세에서 누구에게나 보이고, 앱은 공개
-- URL(getPublicUrl)로 그립니다. 크기·형식은 라우트의 검사와 같은 값입니다
-- (5MB, JPEG·PNG·WebP).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. 정책
--
-- 경로 규약: avatars 버킷 안의 {userId}/{파일명}. 첫 폴더를 auth.uid()의
-- 문자열과 비교하므로 캐스팅이 없고, 모양이 어긋난 다른 버킷 행에서도
-- 에러가 나지 않습니다(00006·00010이 피한 문제).
--
-- SELECT도 본인에게만 줍니다. 공개 URL로 그리므로 화면에는 필요 없고,
-- 열면 Storage list API로 남의 사진 파일 목록이 보입니다. 본인 SELECT는
-- Storage의 remove/move/upsert가 요구해서 남깁니다(00010과 같습니다).
DROP POLICY IF EXISTS avatars_select_own ON storage.objects;
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;

CREATE POLICY avatars_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
