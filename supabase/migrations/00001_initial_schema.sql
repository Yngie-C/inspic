-- ============================================================
-- Inspic 초기 스키마 (MVP 재구성 M1)
--
-- 이 파일은 재구성 이전의 마이그레이션 8개를 대체하는 단일 초기
-- 스키마입니다. 보존할 실사용 데이터가 없다고 확정(2026-08-04)했기
-- 때문에 삭제 마이그레이션을 얹지 않고 통합 리셋했습니다.
-- 재구성 이전 스키마는 `pre-mvp-archive` 태그에 있습니다.
--
-- 적용 대상: 빈 Supabase 프로젝트 (또는 리셋한 기존 프로젝트).
-- 이 파일 이후의 스키마 변경은 새 마이그레이션으로 추가하세요.
-- ============================================================

-- ============================================================
-- 공통 트리거 함수
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1. user_profiles
--
-- 행 생성은 auth.users INSERT 트리거가 단독으로 담당합니다.
-- 클라이언트에서 INSERT 하지 마세요 (INSERT 정책이 없습니다).
-- ============================================================

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. books
-- ============================================================

CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  language TEXT NOT NULL DEFAULT 'ko',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'processing', 'published', 'archived')),
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  source_type TEXT NOT NULL DEFAULT 'text'
    CHECK (source_type IN ('text', 'markdown', 'docx')),
  source_file_url TEXT,
  total_chapters INTEGER NOT NULL DEFAULT 0,
  total_words INTEGER NOT NULL DEFAULT 0,
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),  -- KRW, 0 = 무료
  is_free BOOLEAN GENERATED ALWAYS AS (price = 0) STORED,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_books_owner ON books(owner_id);
CREATE INDEX idx_books_status_visibility ON books(status, visibility, published_at);
CREATE INDEX idx_books_price ON books(price);

-- ============================================================
-- 3. chapters
-- ============================================================

CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  content_html TEXT NOT NULL CHECK (length(content_html) <= 500000),
  content_raw TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  estimated_reading_time INTEGER,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (book_id, slug)
);

CREATE INDEX idx_chapters_book_order ON chapters(book_id, order_index);
CREATE INDEX idx_chapters_book_status ON chapters(book_id, status);

-- ============================================================
-- 4. purchases / payment_transactions
-- ============================================================

CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  price_paid INTEGER NOT NULL CHECK (price_paid >= 0),
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);

CREATE INDEX idx_purchases_user ON purchases(user_id);
CREATE INDEX idx_purchases_book_status ON purchases(book_id, status);

CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  toss_payment_key TEXT UNIQUE,
  toss_order_id TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'in_progress', 'done', 'canceled',
                      'partial_canceled', 'aborted', 'expired')),
  method TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_transactions_user ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_book ON payment_transactions(book_id);

-- ============================================================
-- 접근 판정 헬퍼
--
-- RLS 정책 안에서 다른 테이블을 서브쿼리로 참조하면 그 테이블의
-- 정책이 다시 평가되어 재귀와 성능 문제가 생깁니다. 판정 로직은
-- SECURITY DEFINER 함수 하나로 모으고, 정책은 이 함수만 호출합니다.
-- search_path를 고정해 함수 하이재킹을 막습니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_book_owner(p_book_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM books b
    WHERE b.id = p_book_id
      AND b.owner_id = auth.uid()
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
        OR (
          b.status = 'published'
          AND b.visibility = 'public'
          AND (
            b.price = 0
            OR EXISTS (
              SELECT 1 FROM purchases p
              WHERE p.book_id = b.id
                AND p.user_id = auth.uid()
                AND p.status = 'completed'
            )
          )
        )
      )
  );
$$;

-- ============================================================
-- 5. workbook_blocks — 워크북 블록 정의
--
-- 블록 문항을 content_html의 data-* JSON에서 분리해 보관합니다.
-- id는 DB가 생성하지 않습니다. 에디터가 블록 생성 시 1회 부여한
-- data-node-id를 그대로 받습니다 (블록 ID 불변 규약).
-- config는 문항이 아니라 표현 설정만 담습니다 (scale의 min/max 등).
-- 답변 대상 문항은 workbook_block_fields에 행으로 저장하세요.
-- ============================================================

CREATE TABLE workbook_blocks (
  id UUID PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL
    CHECK (block_type IN ('checklist', 'callout', 'reflection', 'smart_goal', 'scale')),
  order_index INTEGER NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workbook_blocks_chapter ON workbook_blocks(chapter_id, order_index);
CREATE INDEX idx_workbook_blocks_book ON workbook_blocks(book_id);

-- ============================================================
-- 6. workbook_block_fields — 블록 안의 개별 문항
--
-- field_key는 블록 안에서 안정적이어야 합니다. 체크리스트 항목은
-- 항목마다 생성 시 부여한 ID, SMART 목표는 's'~'t', 리플렉션은
-- 'answer', 스케일은 'value'를 씁니다. 배열 인덱스를 쓰지 마세요.
-- ============================================================

CREATE TABLE workbook_block_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES workbook_blocks(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL CHECK (length(field_key) BETWEEN 1 AND 64),
  label TEXT NOT NULL DEFAULT '',
  input_type TEXT NOT NULL
    CHECK (input_type IN ('text', 'longtext', 'boolean', 'integer')),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (block_id, field_key)
);

CREATE INDEX idx_workbook_block_fields_block ON workbook_block_fields(block_id, order_index);

CREATE OR REPLACE FUNCTION public.workbook_block_book_id(p_block_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT wb.book_id FROM workbook_blocks wb WHERE wb.id = p_block_id;
$$;

-- ============================================================
-- 7. workbook_responses — 독자 응답
--
-- 응답의 진실의 원천입니다. localStorage는 오프라인 캐시로만 쓰세요.
--
-- 식별 단위는 (user_id, block_id, field_key)입니다. 배열 인덱스나
-- 길이로 매칭하지 마세요.
--
-- block_id에 FK를 걸지 않은 것은 의도적입니다. 크리에이터가 문항을
-- 지웠다고 독자가 쓴 내용까지 지워지면 안 되기 때문입니다. 대신
-- book_id / chapter_id에는 FK CASCADE가 있습니다 — 책이나 챕터를
-- 통째로 지우는 것은 소유자의 명시적 파기 행위로 봅니다.
-- 정의가 사라진 응답(고아 응답)은 애플리케이션에서 분리해 다룹니다.
-- ============================================================

CREATE TABLE workbook_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  block_id UUID NOT NULL,
  field_key TEXT NOT NULL CHECK (length(field_key) BETWEEN 1 AND 64),
  value_text TEXT CHECK (value_text IS NULL OR length(value_text) <= 20000),
  value_number NUMERIC,
  value_bool BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, block_id, field_key),
  CONSTRAINT workbook_responses_single_value
    CHECK (num_nonnulls(value_text, value_number, value_bool) <= 1)
);

CREATE INDEX idx_workbook_responses_user_book ON workbook_responses(user_id, book_id);
CREATE INDEX idx_workbook_responses_user_chapter ON workbook_responses(user_id, chapter_id);
CREATE INDEX idx_workbook_responses_book_block ON workbook_responses(book_id, block_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbook_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbook_block_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbook_responses ENABLE ROW LEVEL SECURITY;

-- user_profiles: 저자 표시명은 공개 정보. 수정은 본인만.
-- INSERT 정책은 두지 않습니다 (auth.users 트리거가 유일한 생성 경로).
CREATE POLICY user_profiles_select_all ON user_profiles
  FOR SELECT USING (true);
CREATE POLICY user_profiles_update_own ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- books
CREATE POLICY books_select_own ON books
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY books_select_public ON books
  FOR SELECT USING (status = 'published' AND visibility = 'public');
CREATE POLICY books_insert_own ON books
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY books_update_own ON books
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY books_delete_own ON books
  FOR DELETE USING (auth.uid() = owner_id);

-- chapters: 소유자는 draft 포함 전부, 그 외에는 published 챕터를
-- 접근 권한이 있을 때만.
CREATE POLICY chapters_select ON chapters
  FOR SELECT USING (
    public.is_book_owner(book_id)
    OR (status = 'published' AND public.has_book_access(book_id))
  );
CREATE POLICY chapters_insert_own ON chapters
  FOR INSERT WITH CHECK (public.is_book_owner(book_id));
CREATE POLICY chapters_update_own ON chapters
  FOR UPDATE USING (public.is_book_owner(book_id))
  WITH CHECK (public.is_book_owner(book_id));
CREATE POLICY chapters_delete_own ON chapters
  FOR DELETE USING (public.is_book_owner(book_id));

-- purchases
CREATE POLICY purchases_select_own ON purchases
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY purchases_select_as_seller ON purchases
  FOR SELECT USING (public.is_book_owner(book_id));
CREATE POLICY purchases_insert_own ON purchases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- payment_transactions
CREATE POLICY payment_transactions_select_own ON payment_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY payment_transactions_insert_own ON payment_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY payment_transactions_update_own ON payment_transactions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- workbook_blocks: 읽기는 책 접근 권한, 쓰기는 소유자만.
CREATE POLICY workbook_blocks_select ON workbook_blocks
  FOR SELECT USING (public.has_book_access(book_id));
CREATE POLICY workbook_blocks_insert_own ON workbook_blocks
  FOR INSERT WITH CHECK (public.is_book_owner(book_id));
CREATE POLICY workbook_blocks_update_own ON workbook_blocks
  FOR UPDATE USING (public.is_book_owner(book_id))
  WITH CHECK (public.is_book_owner(book_id));
CREATE POLICY workbook_blocks_delete_own ON workbook_blocks
  FOR DELETE USING (public.is_book_owner(book_id));

-- workbook_block_fields: 소속 블록의 책 기준으로 동일하게 판정.
CREATE POLICY workbook_block_fields_select ON workbook_block_fields
  FOR SELECT USING (public.has_book_access(public.workbook_block_book_id(block_id)));
CREATE POLICY workbook_block_fields_insert_own ON workbook_block_fields
  FOR INSERT WITH CHECK (public.is_book_owner(public.workbook_block_book_id(block_id)));
CREATE POLICY workbook_block_fields_update_own ON workbook_block_fields
  FOR UPDATE USING (public.is_book_owner(public.workbook_block_book_id(block_id)))
  WITH CHECK (public.is_book_owner(public.workbook_block_book_id(block_id)));
CREATE POLICY workbook_block_fields_delete_own ON workbook_block_fields
  FOR DELETE USING (public.is_book_owner(public.workbook_block_book_id(block_id)));

-- workbook_responses: 작성자 본인만 읽기/쓰기.
-- 크리에이터는 행을 볼 수 없습니다. 집계는 아래 함수로만 조회합니다.
CREATE POLICY workbook_responses_select_own ON workbook_responses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY workbook_responses_insert_own ON workbook_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.has_book_access(book_id));
CREATE POLICY workbook_responses_update_own ON workbook_responses
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.has_book_access(book_id));
CREATE POLICY workbook_responses_delete_own ON workbook_responses
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 크리에이터용 집계 조회
--
-- 응답 원문은 반환하지 않습니다. 문항별 응답자 수만 돌려줍니다.
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
BEGIN
  IF NOT public.is_book_owner(p_book_id) THEN
    RAISE EXCEPTION 'not the owner of book %', p_book_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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
  GROUP BY r.chapter_id, r.block_id, r.field_key;
END;
$$;

REVOKE ALL ON FUNCTION public.workbook_response_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workbook_response_stats(UUID) TO authenticated;

-- ============================================================
-- auth.users → user_profiles 생성 트리거
--
-- 프로필 생성 경로는 이 트리거 하나뿐입니다. 클라이언트에서
-- user_profiles를 INSERT 하지 마세요 (정책이 없어 실패합니다).
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, display_name)
  VALUES (
    NEW.id,
    NULLIF(
      COALESCE(
        NEW.raw_user_meta_data ->> 'display_name',
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'name',
        split_part(COALESCE(NEW.email, ''), '@', 1)
      ),
      ''
    )
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- updated_at 트리거
-- ============================================================

CREATE TRIGGER set_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_books_updated_at BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_chapters_updated_at BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_workbook_blocks_updated_at BEFORE UPDATE ON workbook_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_workbook_block_fields_updated_at BEFORE UPDATE ON workbook_block_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_workbook_responses_updated_at BEFORE UPDATE ON workbook_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
