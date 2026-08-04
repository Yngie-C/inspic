// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createSchemaTestDb } from "./harness";

/**
 * 초기 스키마가 빈 DB에 그대로 적용되는지, 그리고 구조·제약·트리거가
 * 의도대로 서 있는지 확인합니다. 정책이 실제로 무엇을 막는지는
 * `rls.test.ts`에서 봅니다.
 */

let db: PGlite;

beforeAll(async () => {
  db = await createSchemaTestDb();
}, 60_000);

async function tableNames(): Promise<string[]> {
  const result = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

describe("초기 스키마", () => {
  it("MVP 범위의 테이블만 만든다", async () => {
    expect(await tableNames()).toEqual([
      "books",
      "chapters",
      "payment_transactions",
      "purchases",
      "user_profiles",
      "workbook_block_fields",
      "workbook_blocks",
      "workbook_responses",
    ]);
  });

  it("books에 content_type이 없다 — 시리즈는 범위 밖이다", async () => {
    const result = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'books' AND column_name = 'content_type'`,
    );
    expect(result.rows).toEqual([]);
  });

  it("모든 테이블에 RLS가 켜져 있다", async () => {
    const result = await db.query<{ relname: string }>(
      `SELECT relname FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`,
    );
    expect(result.rows).toEqual([]);
  });

  it("user_profiles에 INSERT 정책이 없다 — 생성 경로는 트리거뿐이다", async () => {
    const result = await db.query<{ cmd: string }>(
      `SELECT cmd FROM pg_policies
       WHERE tablename = 'user_profiles' AND cmd = 'INSERT'`,
    );
    expect(result.rows).toEqual([]);
  });

  it("auth.users에 프로필 생성 트리거를 단다", async () => {
    const result = await db.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created'`,
    );
    expect(result.rows).toHaveLength(1);
  });
});

describe("auth.users 트리거", () => {
  it("가입하면 프로필이 생기고 display_name을 메타데이터에서 가져온다", async () => {
    await db.query(
      `INSERT INTO auth.users (email, raw_user_meta_data)
       VALUES ('writer@example.com', '{"display_name": "글쓴이"}'::jsonb)`,
    );

    const result = await db.query<{ display_name: string }>(
      `SELECT p.display_name FROM user_profiles p
       JOIN auth.users u ON u.id = p.user_id
       WHERE u.email = 'writer@example.com'`,
    );

    expect(result.rows).toEqual([{ display_name: "글쓴이" }]);
  });

  it("메타데이터가 없으면 이메일 로컬파트를 쓴다", async () => {
    await db.query(`INSERT INTO auth.users (email) VALUES ('bare@example.com')`);

    const result = await db.query<{ display_name: string }>(
      `SELECT p.display_name FROM user_profiles p
       JOIN auth.users u ON u.id = p.user_id
       WHERE u.email = 'bare@example.com'`,
    );

    expect(result.rows).toEqual([{ display_name: "bare" }]);
  });
});

describe("workbook_responses 제약", () => {
  let userId: string;
  let bookId: string;
  let chapterId: string;

  beforeAll(async () => {
    const user = await db.query<{ id: string }>(
      `INSERT INTO auth.users (email) VALUES ('reader@example.com') RETURNING id`,
    );
    userId = user.rows[0].id;

    const book = await db.query<{ id: string }>(
      `INSERT INTO books (owner_id, title) VALUES ($1, '워크북') RETURNING id`,
      [userId],
    );
    bookId = book.rows[0].id;

    const chapter = await db.query<{ id: string }>(
      `INSERT INTO chapters (book_id, title, slug, content_html)
       VALUES ($1, '1장', 'ch-1', '<p>본문</p>') RETURNING id`,
      [bookId],
    );
    chapterId = chapter.rows[0].id;
  });

  async function insertResponse(
    blockId: string,
    fieldKey: string,
    values: { text?: string; number?: number; bool?: boolean } = {},
  ) {
    return db.query(
      `INSERT INTO workbook_responses
         (user_id, book_id, chapter_id, block_id, field_key, value_text, value_number, value_bool)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        bookId,
        chapterId,
        blockId,
        fieldKey,
        values.text ?? null,
        values.number ?? null,
        values.bool ?? null,
      ],
    );
  }

  it("(user, block, field)마다 한 건만 허용한다", async () => {
    const blockId = "11111111-1111-1111-1111-111111111111";
    await insertResponse(blockId, "answer", { text: "처음" });

    await expect(
      insertResponse(blockId, "answer", { text: "중복" }),
    ).rejects.toThrow();
  });

  it("값 컬럼을 두 개 이상 채우지 못한다", async () => {
    await expect(
      insertResponse("22222222-2222-2222-2222-222222222222", "answer", {
        text: "글",
        number: 3,
      }),
    ).rejects.toThrow();
  });

  it("블록 정의가 없어도 응답을 저장할 수 있다 — 문항 삭제가 응답을 지우면 안 된다", async () => {
    await expect(
      insertResponse("33333333-3333-3333-3333-333333333333", "orphan", {
        text: "정의는 사라졌지만 남는다",
      }),
    ).resolves.toBeDefined();
  });

  it("챕터를 지우면 그 챕터의 응답도 함께 사라진다", async () => {
    const chapter = await db.query<{ id: string }>(
      `INSERT INTO chapters (book_id, title, slug, content_html)
       VALUES ($1, '2장', 'ch-2', '<p>본문</p>') RETURNING id`,
      [bookId],
    );
    const doomedChapterId = chapter.rows[0].id;

    await db.query(
      `INSERT INTO workbook_responses
         (user_id, book_id, chapter_id, block_id, field_key, value_text)
       VALUES ($1, $2, $3, '44444444-4444-4444-4444-444444444444', 'answer', '사라질 응답')`,
      [userId, bookId, doomedChapterId],
    );

    await db.query(`DELETE FROM chapters WHERE id = $1`, [doomedChapterId]);

    const remaining = await db.query(
      `SELECT 1 FROM workbook_responses WHERE chapter_id = $1`,
      [doomedChapterId],
    );
    expect(remaining.rows).toEqual([]);
  });
});

describe("workbook_block_fields 제약", () => {
  it("한 블록 안에서 field_key가 중복되지 않는다", async () => {
    const user = await db.query<{ id: string }>(
      `INSERT INTO auth.users (email) VALUES ('author@example.com') RETURNING id`,
    );
    const book = await db.query<{ id: string }>(
      `INSERT INTO books (owner_id, title) VALUES ($1, '책') RETURNING id`,
      [user.rows[0].id],
    );
    const chapter = await db.query<{ id: string }>(
      `INSERT INTO chapters (book_id, title, slug, content_html)
       VALUES ($1, '장', 'slug-1', '<p>x</p>') RETURNING id`,
      [book.rows[0].id],
    );

    const blockId = "55555555-5555-5555-5555-555555555555";
    await db.query(
      `INSERT INTO workbook_blocks (id, book_id, chapter_id, block_type)
       VALUES ($1, $2, $3, 'checklist')`,
      [blockId, book.rows[0].id, chapter.rows[0].id],
    );

    await db.query(
      `INSERT INTO workbook_block_fields (block_id, field_key, input_type)
       VALUES ($1, 'item-a', 'boolean')`,
      [blockId],
    );

    await expect(
      db.query(
        `INSERT INTO workbook_block_fields (block_id, field_key, input_type)
         VALUES ($1, 'item-a', 'boolean')`,
        [blockId],
      ),
    ).rejects.toThrow();
  });
});
