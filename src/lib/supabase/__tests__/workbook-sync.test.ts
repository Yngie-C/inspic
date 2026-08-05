// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSchemaTestDb, makeRoleRunners } from "./harness";
import type { WorkbookBlock } from "@/lib/workbook/types";

/**
 * `sync_chapter_workbook_blocks` — 저작 측이 블록 정의를 쓰는 유일한 경로.
 *
 * 여기서 지켜야 하는 것은 하나입니다. **정의가 어떻게 바뀌어도 독자가 쓴
 * 응답은 지워지지 않는다.** 크리에이터는 출간 후에도 문항을 고치는데,
 * 그때마다 독자 응답이 조용히 사라지면 이 제품의 베팅 자체가 무너집니다.
 *
 * M1의 `responses.test.ts`가 순수 함수 층에서 같은 규약을 보고, 이 파일은
 * 실제 Postgres에서 RLS를 켠 채로 봅니다.
 */

let db: PGlite;
let asUser: <T>(userId: string, run: () => Promise<T>) => Promise<T>;

let creator: string;
let outsider: string;
let reader: string;

let book: string;
let chapter: string;
let otherChapter: string;

const BLOCK_A = "11111111-1111-4111-8111-111111111111";
const BLOCK_B = "22222222-2222-4222-8222-222222222222";

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

/** 무료·공개 책이라 독자가 응답을 넣을 수 있습니다 (has_book_access). */
async function seedBook(owner: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO books (owner_id, title, price, status, visibility)
     VALUES ($1, '워크북', 0, 'published', 'public') RETURNING id`,
    [owner],
  );
  return result.rows[0].id;
}

async function seedChapter(bookId: string, slug: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO chapters (book_id, title, slug, content_html, status)
     VALUES ($1, $2, $2, '<p>본문</p>', 'published') RETURNING id`,
    [bookId, slug],
  );
  return result.rows[0].id;
}

// ------------------------------------------------------------
// 블록 payload 만들기 — extractWorkbookBlocks()가 내놓는 모양 그대로
// ------------------------------------------------------------

function reflection(
  id: string,
  label: string,
  orderIndex = 0,
): WorkbookBlock {
  return {
    id,
    block_type: "reflection",
    order_index: orderIndex,
    config: {},
    fields: [
      { field_key: "answer", label, input_type: "longtext", order_index: 0 },
    ],
  };
}

function checklist(
  id: string,
  items: ReadonlyArray<{ key: string; label: string }>,
  orderIndex = 0,
): WorkbookBlock {
  return {
    id,
    block_type: "checklist",
    order_index: orderIndex,
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
// 호출 헬퍼
// ------------------------------------------------------------

interface SyncCounts {
  blocks_upserted: number;
  blocks_removed: number;
  fields_upserted: number;
  fields_removed: number;
}

function sync(
  userId: string,
  chapterId: string,
  blocks: readonly WorkbookBlock[],
): Promise<SyncCounts> {
  return asUser(userId, async () => {
    const result = await db.query<{ sync_chapter_workbook_blocks: SyncCounts }>(
      `SELECT public.sync_chapter_workbook_blocks($1, $2::jsonb)`,
      [chapterId, JSON.stringify(blocks)],
    );
    return result.rows[0].sync_chapter_workbook_blocks;
  });
}

/** 독자가 응답을 남깁니다. RLS를 거치므로 실제 저장 경로와 같습니다. */
async function answer(
  userId: string,
  blockId: string,
  fieldKey: string,
  value: string,
): Promise<void> {
  await asUser(userId, () =>
    db.query(
      `INSERT INTO workbook_responses
         (user_id, book_id, chapter_id, block_id, field_key, value_text)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, book, chapter, blockId, fieldKey, value],
    ),
  );
}

async function blockRows(chapterId: string) {
  const result = await db.query<{
    id: string;
    block_type: string;
    order_index: number;
    config: Record<string, unknown>;
  }>(
    `SELECT id, block_type, order_index, config FROM workbook_blocks
     WHERE chapter_id = $1 ORDER BY order_index`,
    [chapterId],
  );
  return result.rows;
}

async function fieldKeys(blockId: string): Promise<string[]> {
  const result = await db.query<{ field_key: string }>(
    `SELECT field_key FROM workbook_block_fields
     WHERE block_id = $1 ORDER BY order_index`,
    [blockId],
  );
  return result.rows.map((row) => row.field_key);
}

async function fieldLabel(blockId: string, key: string): Promise<string> {
  const result = await db.query<{ label: string }>(
    `SELECT label FROM workbook_block_fields
     WHERE block_id = $1 AND field_key = $2`,
    [blockId, key],
  );
  return result.rows[0]?.label ?? "";
}

/** 독자 본인이 자기 응답을 읽습니다. */
async function myAnswers(
  userId: string,
): Promise<Array<{ block_id: string; field_key: string; value_text: string }>> {
  return asUser(userId, async () => {
    const result = await db.query<{
      block_id: string;
      field_key: string;
      value_text: string;
    }>(
      `SELECT block_id, field_key, value_text FROM workbook_responses
       WHERE user_id = $1 ORDER BY field_key`,
      [userId],
    );
    return result.rows;
  });
}

beforeAll(async () => {
  db = await createSchemaTestDb();
  ({ asUser } = makeRoleRunners(db));

  creator = await seedUser("creator@example.com");
  outsider = await seedUser("outsider@example.com");
  reader = await seedUser("reader@example.com");
});

beforeEach(async () => {
  // 테스트마다 새 책·챕터를 씁니다. DB 생성은 느려서 한 번만 하고,
  // 격리는 픽스처 단위로 잡습니다.
  await db.exec("DELETE FROM workbook_responses");
  await db.exec("DELETE FROM books");

  book = await seedBook(creator);
  chapter = await seedChapter(book, "ch-1");
  otherChapter = await seedChapter(book, "ch-2");
});

describe("블록 정의 반영", () => {
  it("새 블록과 문항을 만든다", async () => {
    const counts = await sync(creator, chapter, [
      reflection(BLOCK_A, "무엇을 배웠나요?"),
      checklist(
        BLOCK_B,
        [
          { key: "k1", label: "환경 설정" },
          { key: "k2", label: "첫 실행" },
        ],
        1,
      ),
    ]);

    expect(counts.blocks_upserted).toBe(2);
    expect(counts.fields_upserted).toBe(3);

    expect((await blockRows(chapter)).map((row) => row.id)).toEqual([
      BLOCK_A,
      BLOCK_B,
    ]);
    expect(await fieldKeys(BLOCK_B)).toEqual(["k1", "k2"]);
  });

  it("문구를 고치면 라벨만 갱신되고 블록은 그대로다", async () => {
    await sync(creator, chapter, [reflection(BLOCK_A, "예전 질문")]);
    await sync(creator, chapter, [reflection(BLOCK_A, "새 질문")]);

    expect(await fieldLabel(BLOCK_A, "answer")).toBe("새 질문");
    expect(await blockRows(chapter)).toHaveLength(1);
  });

  it("빈 배열이면 이 챕터의 블록을 전부 지운다", async () => {
    await sync(creator, chapter, [reflection(BLOCK_A, "질문")]);

    const counts = await sync(creator, chapter, []);

    expect(counts.blocks_removed).toBe(1);
    expect(await blockRows(chapter)).toHaveLength(0);
  });

  it("다른 챕터의 블록은 건드리지 않는다", async () => {
    await sync(creator, chapter, [reflection(BLOCK_A, "1장 질문")]);
    await sync(creator, otherChapter, [reflection(BLOCK_B, "2장 질문")]);

    await sync(creator, chapter, []);

    expect(await blockRows(chapter)).toHaveLength(0);
    expect(await blockRows(otherChapter)).toHaveLength(1);
  });

  it("블록을 다른 챕터로 옮기면 소속만 바뀐다", async () => {
    await sync(creator, chapter, [reflection(BLOCK_A, "질문")]);

    // 잘라내기·붙여넣기: 2장에 나타나고 1장에서 사라집니다.
    await sync(creator, otherChapter, [reflection(BLOCK_A, "질문")]);
    await sync(creator, chapter, []);

    expect(await blockRows(chapter)).toHaveLength(0);
    expect((await blockRows(otherChapter)).map((row) => row.id)).toEqual([
      BLOCK_A,
    ]);
  });

  it("payload에 같은 ID가 두 번 와도 저장이 실패하지 않는다", async () => {
    // ON CONFLICT는 한 명령에서 같은 행을 두 번 건드리면 에러를 냅니다.
    // 그대로 두면 챕터 저장 전체가 실패하므로 함수가 앞의 것만 씁니다.
    const counts = await sync(creator, chapter, [
      reflection(BLOCK_A, "먼저 온 질문"),
      reflection(BLOCK_A, "나중에 온 질문"),
    ]);

    expect(counts.blocks_upserted).toBe(1);
    expect(await fieldLabel(BLOCK_A, "answer")).toBe("먼저 온 질문");
  });

  it("config를 저장하고 갱신한다", async () => {
    const scale = (min: number, max: number): WorkbookBlock => ({
      id: BLOCK_A,
      block_type: "scale",
      order_index: 0,
      config: { min, max, label_min: "낮음", label_max: "높음" },
      fields: [
        { field_key: "value", label: "", input_type: "integer", order_index: 0 },
      ],
    });

    await sync(creator, chapter, [scale(1, 10)]);
    await sync(creator, chapter, [scale(1, 5)]);

    expect((await blockRows(chapter))[0].config).toMatchObject({
      min: 1,
      max: 5,
    });
  });
});

describe("독자 응답 보존", () => {
  it("문항을 추가해도 기존 응답이 남는다", async () => {
    await sync(creator, chapter, [
      checklist(BLOCK_A, [{ key: "k1", label: "환경 설정" }]),
    ]);
    await answer(reader, BLOCK_A, "k1", "done");

    await sync(creator, chapter, [
      checklist(BLOCK_A, [
        { key: "k0", label: "앞에 끼워 넣은 항목" },
        { key: "k1", label: "환경 설정" },
        { key: "k2", label: "뒤에 붙인 항목" },
      ]),
    ]);

    expect(await myAnswers(reader)).toEqual([
      { block_id: BLOCK_A, field_key: "k1", value_text: "done" },
    ]);
  });

  it("문항을 지워도 응답은 남는다 — 정의만 사라진다", async () => {
    await sync(creator, chapter, [
      checklist(BLOCK_A, [
        { key: "k1", label: "항목 1" },
        { key: "k2", label: "항목 2" },
      ]),
    ]);
    await answer(reader, BLOCK_A, "k1", "yes");
    await answer(reader, BLOCK_A, "k2", "yes");

    const counts = await sync(creator, chapter, [
      checklist(BLOCK_A, [{ key: "k1", label: "항목 1" }]),
    ]);

    expect(counts.fields_removed).toBe(1);
    expect(await fieldKeys(BLOCK_A)).toEqual(["k1"]);
    // k2의 정의는 사라졌지만 독자가 쓴 것은 그대로입니다.
    expect(await myAnswers(reader)).toHaveLength(2);
  });

  it("지웠던 문항을 되살리면 응답이 다시 붙는다", async () => {
    await sync(creator, chapter, [
      checklist(BLOCK_A, [{ key: "k1", label: "항목 1" }]),
    ]);
    await answer(reader, BLOCK_A, "k1", "yes");

    await sync(creator, chapter, [checklist(BLOCK_A, [])]);
    await sync(creator, chapter, [
      checklist(BLOCK_A, [{ key: "k1", label: "항목 1" }]),
    ]);

    // (block_id, field_key)로만 만나기 때문에 가능한 일입니다.
    // 인덱스로 매칭했다면 여기서 응답이 끊겼습니다.
    expect(await myAnswers(reader)).toEqual([
      { block_id: BLOCK_A, field_key: "k1", value_text: "yes" },
    ]);
  });

  it("블록을 통째로 지워도 응답은 남는다", async () => {
    await sync(creator, chapter, [reflection(BLOCK_A, "질문")]);
    await answer(reader, BLOCK_A, "answer", "제 생각은...");

    await sync(creator, chapter, []);

    expect(await blockRows(chapter)).toHaveLength(0);
    expect(await myAnswers(reader)).toHaveLength(1);
  });

  it("순서만 바꿔도 응답은 그대로다", async () => {
    await sync(creator, chapter, [
      reflection(BLOCK_A, "질문 1", 0),
      reflection(BLOCK_B, "질문 2", 1),
    ]);
    await answer(reader, BLOCK_A, "answer", "A의 답");
    await answer(reader, BLOCK_B, "answer", "B의 답");

    await sync(creator, chapter, [
      reflection(BLOCK_B, "질문 2", 0),
      reflection(BLOCK_A, "질문 1", 1),
    ]);

    expect((await blockRows(chapter)).map((row) => row.id)).toEqual([
      BLOCK_B,
      BLOCK_A,
    ]);
    const answers = await myAnswers(reader);
    expect(answers.map((row) => [row.block_id, row.value_text])).toEqual([
      [BLOCK_A, "A의 답"],
      [BLOCK_B, "B의 답"],
    ]);
  });
});

describe("권한", () => {
  it("책 소유자가 아니면 거부한다", async () => {
    await expect(
      sync(outsider, chapter, [reflection(BLOCK_A, "남의 책에 쓰기")]),
    ).rejects.toThrow(/not the owner/);
  });

  it("독자도 거부한다 — 공개된 무료 책이어도", async () => {
    await expect(
      sync(reader, chapter, [reflection(BLOCK_A, "독자가 쓰기")]),
    ).rejects.toThrow(/not the owner/);
  });

  it("없는 챕터는 거부한다", async () => {
    await expect(
      sync(creator, "99999999-9999-4999-8999-999999999999", []),
    ).rejects.toThrow(/not found/);
  });

  it("남의 블록을 내 챕터로 끌어오지 못한다", async () => {
    // 소유자가 만든 블록을 다른 사람이 payload에 실어 자기 챕터로
    // 옮기려는 시도. workbook_blocks UPDATE 정책이 막습니다.
    await sync(creator, chapter, [reflection(BLOCK_A, "원본")]);

    const otherBook = await seedBook(outsider);
    const otherBookChapter = await seedChapter(otherBook, "outsider-ch-1");

    await expect(
      sync(outsider, otherBookChapter, [reflection(BLOCK_A, "가져오기")]),
    ).rejects.toThrow();

    const rows = await blockRows(chapter);
    expect(rows.map((row) => row.id)).toEqual([BLOCK_A]);
  });
});
