-- ============================================================
-- 00013: 책 소개 이미지 — 저자가 고를 수 있는 세로 이미지 한 장
--
-- 서점 상세 페이지의 "상세 이미지"처럼, 저자가 책 소개 아래에 이미지
-- 한 장을 둘 수 있습니다(2026-10-21). 올리지 않으면 상세 화면은
-- 지금과 같습니다.
--
-- 파일은 표지와 같은 covers 버킷의 covers/{bookId}/detail-*에 둡니다.
-- 00010의 정책이 두 번째 폴더의 책 ID로 소유자를 판정하므로 버킷과
-- 정책은 새로 만들지 않습니다. URL은 `/api/books/[bookId]/detail-image`
-- 업로드로만 바꿉니다(책 PUT은 거절합니다 — 표지와 같은 이유).
--
-- detail_image_alt는 이미지 속 글을 옮겨 적는 대체 글입니다. 화면
-- 낭독기는 이미지 속 글자를 읽지 못합니다. 길이 상한은 라우트가 먼저
-- 검사합니다(PUT /api/books/[bookId]).
--
-- 정책은 추가하지 않습니다. 기존 books UPDATE(소유자)가 그대로 덮습니다.
-- ============================================================

ALTER TABLE books
  ADD COLUMN detail_image_url TEXT,
  ADD COLUMN detail_image_alt TEXT
    CHECK (detail_image_alt IS NULL OR char_length(detail_image_alt) <= 2000);
