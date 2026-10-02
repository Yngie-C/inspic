-- ============================================================
-- 코드 리뷰 WP3 — 구매자 접근과 노출
--
-- 1. 구매는 공개 상태보다 먼저 봅니다. 저자가 책을 비공개·보관·초안으로
--    돌려도 이미 산 독자는 계속 읽고, 답을 저장하고, 내보냅니다.
-- 2. chapter-images 버킷의 익명 SELECT를 없앱니다. 공개 버킷이라 URL로
--    받는 데는 정책이 필요 없고, 정책이 열어 준 것은 파일 목록(list)
--    뿐이었습니다.
-- 3. 결제·구매 기록은 책 삭제로 지워지지 않습니다 (CASCADE → RESTRICT).
--    판매된 책은 지울 수 없고, 내리기(비공개)로 안내합니다.
--
-- 적용: Supabase SQL 에디터 또는 `supabase db push`.
-- 00005가 이미 적용된 프로젝트에 이어서 올리세요.
-- ============================================================

-- ============================================================
-- 1. 구매자 접근
--
-- 00001의 has_book_access는 구매자에게도 `published` + `public`을
-- 요구했습니다. 저자가 책을 내리면 구매자의 챕터 목록이 비고, 응답
-- INSERT/UPDATE가 WITH CHECK에서 막히고, 서재에서 책이 사라졌습니다.
-- "돈이 나갔으면 책이 열린다"에 어긋납니다.
--
-- 판정 순서: 소유자 → 완료된 구매 → (공개 발행본이고 무료).
-- TS의 checkBookAccess()도 같은 순서입니다. 바꾸면 둘 다 바꾸세요.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_book_purchaser(p_book_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM purchases p
     WHERE p.book_id = p_book_id
       AND p.user_id = auth.uid()
       AND p.status = 'completed'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_book_access(p_book_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM books b
    WHERE b.id = p_book_id
      AND (
        b.owner_id = auth.uid()
        OR public.is_book_purchaser(b.id)
        OR (
          b.status = 'published'
          AND b.visibility = 'public'
          AND b.price = 0
        )
      )
  );
$$;

-- 책 행 자체도 구매자에게 보여야 합니다. books_select_public만으로는
-- 내려간 책의 행이 RLS에 걸려, 챕터는 열리는데 책 정보(제목·표지)를
-- 못 읽는 상태가 됩니다 — 서재·리더·내보내기가 모두 책 행부터 읽습니다.
--
-- 목록 화면(explore, landing)은 status/visibility를 직접 걸러 쓰므로
-- 이 정책으로 산 책이 탐색에 섞이지 않습니다.
CREATE POLICY books_select_purchased ON books
  FOR SELECT USING (public.is_book_purchaser(id));

-- ============================================================
-- 2. chapter-images — 파일 목록을 소유자에게만
--
-- 00002의 chapter_images_select_public은 anon에게 버킷 전체 SELECT를
-- 줬습니다. 공개 버킷의 파일은 공개 URL로 정책 없이 내려가므로 리더가
-- 이미지를 그리는 데 이 정책은 필요 없었고, 실제로 연 것은 Storage
-- list API였습니다. book id는 URL에 드러나 있어서
-- list('<유료 bookId>/<chapterId>')로 파일명을 얻으면 유료 본문의
-- 이미지를 전부 받을 수 있었습니다.
--
-- 소유자 SELECT는 남깁니다. Storage의 remove/move/upsert는 SELECT를
-- 함께 요구합니다.
--
-- 첫 폴더를 uuid로 바꾸기 전에 모양부터 봅니다. SELECT 정책은 다른
-- 버킷 행에도 평가될 수 있고, 거기서 캐스팅이 실패하면 그 버킷의
-- 조회까지 에러가 납니다. CASE는 평가 순서를 보장합니다.
-- ============================================================

DROP POLICY IF EXISTS chapter_images_select_public ON storage.objects;

CREATE POLICY chapter_images_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chapter-images'
    AND CASE
      WHEN (storage.foldername(name))[1]
           ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.is_book_owner(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

-- ============================================================
-- 3. 결제·구매 기록은 책보다 오래 남는다
--
-- purchases와 payment_transactions의 book_id가 ON DELETE CASCADE였습니다.
-- 팔린 책을 저자가 지우면 구매자의 서재에서 책이 사라지고, 환불·정산
-- 근거도 DB에서 함께 없어졌습니다.
--
-- RESTRICT로 바꿉니다. 결제 행이 하나라도 있는 책(결제창을 열었다
-- 닫은 주문 포함)은 지울 수 없고, 앱은 이 FK 위반(23503)을 "판매된
-- 책은 비공개로 내려 주세요"로 안내합니다. 결제 행은 공개 발행본에만
-- 생기므로(create_payment_request) 작업 중인 원고의 삭제는 그대로입니다.
--
-- 판정을 앱에서 미리 세지 않고 FK 하나에 맡기는 이유: 확인과 삭제
-- 사이에 결제가 들어오는 틈이 없고, 저자가 볼 수 없는 결제 행
-- (payment_transactions는 결제한 본인만 SELECT)까지 함께 지킵니다.
--
-- 저자 계정 삭제(auth.users → books CASCADE)도 판매된 책이 있으면
-- 여기서 막힙니다. 의도한 것입니다 — 사람이 정산을 보고 처리하세요.
-- ============================================================

ALTER TABLE purchases
  DROP CONSTRAINT purchases_book_id_fkey,
  ADD CONSTRAINT purchases_book_id_fkey
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT;

ALTER TABLE payment_transactions
  DROP CONSTRAINT payment_transactions_book_id_fkey,
  ADD CONSTRAINT payment_transactions_book_id_fkey
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT;
