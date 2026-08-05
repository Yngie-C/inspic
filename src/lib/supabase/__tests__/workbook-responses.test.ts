// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSchemaTestDb, makeRoleRunners } from "./harness";
import {
  buildResponseRows,
  parseResponseWrites,
  type ResponseRow,
  type StoredFieldDefinition,
} from "@/lib/workbook/response-payload";
import type { WorkbookBlock } from "@/lib/workbook/types";

/**
 * 독자 응답의 DB 왕복 — M3의 게이트를 실제 Postgres에서 확인합니다.
 *
 * **기기 A에서 쓰고 기기 B에서 이어서 쓴다.** 브라우저 저장소가 아니라
 * 서버에 남아야 성립하고, 응답이 `(user_id, block_id, field_key)`로만
 * 식별돼야 같은 문항을 두 번 쓰지 않습니다.
 *
 * `workbook-sync.test.ts`가 저작 측(정의가 바뀌어도 응답이 남는가)을 본다면
 * 여기는 독자 측(응답이 제대로 들어가고 나오는가)을 봅니다. 라우트의
 * upsert와 같은 문장을 쓰되, 권한은 RLS가 실제로 판정하게 둡니다.
 */

let db: PGlite;
let asUser: <T>(userId: string, run: () => Promise<T>) => Promise<T>;
let asAnon: <T>(run: () => Promise<T>) => Promise<T>;

let creator: string;
let readerA: string;
let readerB: string;
let outsider: string;

let book: string;
let chapter: string;

const BLOCK = "11111111-1111-4111-8111-111111111111";

// ------------------------------------------------------------
// 픽스처
// ------------------------------------------------------------

async function seedUser(email: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
    [email],
  );
  return result.rows[0].id;
}

/** 무료·공개 책. has_book_access가 통과해야 응답을 넣을 수 있습니다. */
async function seedBook(owner: string, price = 0): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO books (owner_id, title, price, status, visibility)
     VALUES ($1, '워크북', $2, 'published', 'public') RETURNING id`,
    [owner, price],
  );
  return result.rows[0].id;
}

async function seedChapter(bookId: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO chapters (book_id, title, slug, content_html, status)
     VALUES ($1, '1장', 'ch-1', '<p>본문</p>', 'published') RETURNING id`,
    [bookId],
  );
  return result.rows[0].id;
}

/** 저작 측과 같은 경로로 블록 정의를 넣습니다. */
async function syncBlocks(blocks: WorkbookBlock[]): Promise<void> {
  await asUser(creator, async () => {
    await db.query(`SELECT sync_chapter_workbook_blocks($1, $2::jsonb)`, [
      chapter,
      JSON.stringify(blocks),
    ]);
  });
}

function checklistBlock(
  items: ReadonlyArray<{ key: string; label: string }>,
): WorkbookBlock {
  return {
    id: BLOCK,
    block_type: "checklist",
    order_index: 0,
    config: {},
    fields: items.map((item, index) => ({
      field_key: item.key,
      label: item.label,
      input_type: "boolean" as const,
      order_index: index,
    })),
  };
}

// ------------------------------------------------------------
// 라우트가 하는 일을 그대로: 정의를 읽고 → 행을 만들고 → upsert
// ------------------------------------------------------------

async function loadDefinitions(): Promise<StoredFieldDefinition[]> {
  const result = await db.query<StoredFieldDefinition>(
    `SELECT f.block_id, f.field_key, f.input_type, b.chapter_id, b.book_id
       FROM workbook_block_fields f
       JOIN workbook_blocks b ON b.id = f.block_id
      WHERE b.book_id = $1`,
    [book],
  );
  return result.rows;
}

async function upsert(rows: readonly ResponseRow[]): Promise<void> {
  for (const row of rows) {
    await db.query(
      `INSERT INTO workbook_responses
         (user_id, book_id, chapter_id, block_id, field_key,
          value_text, value_number, value_bool)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, block_id, field_key) DO UPDATE SET
         value_text = EXCLUDED.value_text,
         value_number = EXCLUDED.value_number,
         value_bool = EXCLUDED.value_bool,
         chapter_id = EXCLUDED.chapter_id`,
      [
        row.user_id,
        row.book_id,
        row.chapter_id,
        row.block_id,
        row.field_key,
        row.value_text,
        row.value_number,
        row.value_bool,
      ],
    );
  }
}

/** PUT /api/books/[bookId]/responses 한 번. */
async function saveAs(
  userId: string,
  answers: Array<{ block_id: string; field_key: string; value: unknown }>,
): Promise<{ saved: number; rejected: number }> {
  const parsed = parseResponseWrites({ answers });
  if (!parsed.ok) throw new Error(parsed.error);

  return asUser(userId, async () => {
    const definitions = await loadDefinitions();
    const { rows, rejected } = buildResponseRows(
      userId,
      parsed.writes,
      definitions,
    );
    await upsert(rows);
    return { saved: rows.length, rejected: rejected.length };
  });
}

/** GET /api/books/[bookId]/responses 한 번. */
async function readAs(userId: string) {
  return asUser(userId, async () => {
    const result = await db.query<{
      block_id: string;
      field_key: string;
      value_text: string | null;
      value_number: string | null;
      value_bool: boolean | null;
    }>(
      `SELECT block_id, field_key, value_text, value_number, value_bool
         FROM workbook_responses WHERE book_id = $1
        ORDER BY field_key`,
      [book],
    );
    return result.rows;
  });
}

// ------------------------------------------------------------

beforeAll(async () => {
  db = await createSchemaTestDb();
  ({ asUser, asAnon } = makeRoleRunners(db));
});

beforeEach(async () => {
  await db.exec(`
    DELETE FROM workbook_responses;
    DELETE FROM workbook_blocks;
    DELETE FROM chapters;
    DELETE FROM books;
    DELETE FROM auth.users;
  `);

  creator = await seedUser("creator@test.dev");
  readerA = await seedUser("reader-a@test.dev");
  readerB = await seedUser("reader-b@test.dev");
  outsider = await seedUser("outsider@test.dev");

  book = await seedBook(creator);
  chapter = await seedChapter(book);
});

describe("독자 응답 왕복", () => {
  it("쓴 응답을 그대로 다시 읽는다", async () => {
    await syncBlocks([
      checklistBlock([
        { key: "a", label: "물 마시기" },
        { key: "b", label: "산책하기" },
      ]),
    ]);

    const result = await saveAs(readerA, [
      { block_id: BLOCK, field_key: "a", value: true },
      { block_id: BLOCK, field_key: "b", value: false },
    ]);

    expect(result).toEqual({ saved: 2, rejected: 0 });
    expect(await readAs(readerA)).toEqual([
      expect.objectContaining({ field_key: "a", value_bool: true }),
      expect.objectContaining({ field_key: "b", value_bool: false }),
    ]);
  });

  it("같은 문항을 다시 쓰면 행이 늘지 않고 값만 바뀐다", async () => {
    // 기기 A에서 고치고 기기 B에서 또 고쳐도 문항당 한 행입니다.
    await syncBlocks([checklistBlock([{ key: "a", label: "물 마시기" }])]);

    await saveAs(readerA, [{ block_id: BLOCK, field_key: "a", value: true }]);
    await saveAs(readerA, [{ block_id: BLOCK, field_key: "a", value: false }]);

    const rows = await readAs(readerA);
    expect(rows).toHaveLength(1);
    expect(rows[0].value_bool).toBe(false);
  });

  it("기기 A에서 쓴 응답을 기기 B가 이어받는다", async () => {
    // 같은 계정의 다른 세션입니다. 브라우저 저장소가 아니라 DB에 있으니
    // 한쪽에서 쓴 값이 다른 쪽 조회에 그대로 나옵니다.
    await syncBlocks([
      checklistBlock([
        { key: "a", label: "물 마시기" },
        { key: "b", label: "산책하기" },
      ]),
    ]);

    await saveAs(readerA, [{ block_id: BLOCK, field_key: "a", value: true }]);
    const fromOtherDevice = await readAs(readerA);
    expect(fromOtherDevice).toHaveLength(1);

    // 기기 B에서 이어서 다른 문항을 씁니다.
    await saveAs(readerA, [{ block_id: BLOCK, field_key: "b", value: true }]);

    expect(await readAs(readerA)).toEqual([
      expect.objectContaining({ field_key: "a", value_bool: true }),
      expect.objectContaining({ field_key: "b", value_bool: true }),
    ]);
  });

  it("독자마다 자기 응답만 보인다", async () => {
    await syncBlocks([checklistBlock([{ key: "a", label: "물 마시기" }])]);

    await saveAs(readerA, [{ block_id: BLOCK, field_key: "a", value: true }]);
    await saveAs(readerB, [{ block_id: BLOCK, field_key: "a", value: false }]);

    expect((await readAs(readerA))[0].value_bool).toBe(true);
    expect((await readAs(readerB))[0].value_bool).toBe(false);
  });

  it("크리에이터는 독자 응답 원문을 못 읽는다", async () => {
    await syncBlocks([checklistBlock([{ key: "a", label: "물 마시기" }])]);
    await saveAs(readerA, [{ block_id: BLOCK, field_key: "a", value: true }]);

    expect(await readAs(creator)).toHaveLength(0);
  });

  it("정의가 DB에 없는 블록에는 저장하지 않는다", async () => {
    // 크리에이터가 아직 챕터를 저장하지 않은 상태입니다.
    const result = await saveAs(readerA, [
      { block_id: BLOCK, field_key: "a", value: true },
    ]);

    expect(result).toEqual({ saved: 0, rejected: 1 });
    expect(await readAs(readerA)).toHaveLength(0);
  });

  it("크리에이터가 문항을 지워도 그 응답은 남는다", async () => {
    // M3의 두 번째 게이트. 정의는 사라져도 독자가 쓴 것은 독자 것입니다.
    await syncBlocks([
      checklistBlock([
        { key: "a", label: "물 마시기" },
        { key: "b", label: "산책하기" },
      ]),
    ]);
    await saveAs(readerA, [
      { block_id: BLOCK, field_key: "a", value: true },
      { block_id: BLOCK, field_key: "b", value: true },
    ]);

    // 크리에이터가 "산책하기"를 지우고 재발행합니다.
    await syncBlocks([checklistBlock([{ key: "a", label: "물 마시기" }])]);

    const rows = await readAs(readerA);
    expect(rows.map((row) => row.field_key)).toEqual(["a", "b"]);
  });

  it("지운 문항을 되살리면 옛 응답이 그대로 붙는다", async () => {
    await syncBlocks([
      checklistBlock([
        { key: "a", label: "물 마시기" },
        { key: "b", label: "산책하기" },
      ]),
    ]);
    await saveAs(readerA, [{ block_id: BLOCK, field_key: "b", value: true }]);

    await syncBlocks([checklistBlock([{ key: "a", label: "물 마시기" }])]);
    await syncBlocks([
      checklistBlock([
        { key: "a", label: "물 마시기" },
        { key: "b", label: "산책하기 (수정)" },
      ]),
    ]);

    const rows = await readAs(readerA);
    expect(rows.find((row) => row.field_key === "b")?.value_bool).toBe(true);
  });

  it("응답을 지우면 값만 비고 행은 남는다", async () => {
    // "답했다가 지웠다"와 "한 번도 안 봤다"는 다른 상태입니다.
    await syncBlocks([
      {
        id: BLOCK,
        block_type: "reflection",
        order_index: 0,
        config: {},
        fields: [
          {
            field_key: "answer",
            label: "무엇을 배웠나요?",
            input_type: "longtext",
            order_index: 0,
          },
        ],
      },
    ]);

    await saveAs(readerA, [
      { block_id: BLOCK, field_key: "answer", value: "썼다" },
    ]);
    await saveAs(readerA, [
      { block_id: BLOCK, field_key: "answer", value: "" },
    ]);

    const rows = await readAs(readerA);
    expect(rows).toHaveLength(1);
    expect(rows[0].value_text).toBeNull();
  });
});

describe("응답 권한", () => {
  it("유료 책을 사지 않은 사람은 응답을 넣지 못한다", async () => {
    const paidBook = await seedBook(creator, 9900);
    const paidChapter = await db.query<{ id: string }>(
      `INSERT INTO chapters (book_id, title, slug, content_html, status)
       VALUES ($1, '1장', 'paid-ch-1', '<p>본문</p>', 'published') RETURNING id`,
      [paidBook],
    );

    await db.query(
      `INSERT INTO workbook_blocks (id, book_id, chapter_id, block_type, order_index)
       VALUES ($1, $2, $3, 'reflection', 0)`,
      [BLOCK, paidBook, paidChapter.rows[0].id],
    );

    await expect(
      asUser(outsider, () =>
        db.query(
          `INSERT INTO workbook_responses
             (user_id, book_id, chapter_id, block_id, field_key, value_text)
           VALUES ($1, $2, $3, $4, 'answer', '몰래')`,
          [outsider, paidBook, paidChapter.rows[0].id, BLOCK],
        ),
      ),
    ).rejects.toThrow();
  });

  it("남의 이름으로 응답을 넣지 못한다", async () => {
    await syncBlocks([checklistBlock([{ key: "a", label: "물 마시기" }])]);

    await expect(
      asUser(outsider, () =>
        db.query(
          `INSERT INTO workbook_responses
             (user_id, book_id, chapter_id, block_id, field_key, value_bool)
           VALUES ($1, $2, $3, $4, 'a', true)`,
          [readerA, book, chapter, BLOCK],
        ),
      ),
    ).rejects.toThrow();
  });

  it("비로그인 방문자는 응답을 읽지도 쓰지도 못한다", async () => {
    await syncBlocks([checklistBlock([{ key: "a", label: "물 마시기" }])]);
    await saveAs(readerA, [{ block_id: BLOCK, field_key: "a", value: true }]);

    const visible = await asAnon(async () => {
      const result = await db.query(`SELECT * FROM workbook_responses`);
      return result.rows;
    });

    expect(visible).toHaveLength(0);
  });
});
