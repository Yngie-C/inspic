// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createSchemaTestDb, makeRoleRunners } from "./harness";

/**
 * RLS 정책이 실제로 무엇을 막고 무엇을 여는지 확인합니다.
 *
 * "RLS가 켜져 있다"는 검증이 아닙니다. 그건 `schema.test.ts`가 봅니다.
 * 여기서 보는 것은 유료 콘텐츠가 새지 않는가, 독자가 쓴 내용이 남에게
 * 보이지 않는가입니다. 이 두 가지는 조용히 실패하는 종류라 코드로
 * 고정해 두지 않으면 드러나지 않습니다.
 *
 * 모든 쿼리는 `asUser` / `asAnon`을 거칩니다. 기본 연결(postgres)은
 * 테이블 소유자라 RLS를 우회하므로 그대로 쓰면 아무것도 검증되지 않습니다.
 */

let db: PGlite;
let asUser: <T>(userId: string, run: () => Promise<T>) => Promise<T>;
let asAnon: <T>(run: () => Promise<T>) => Promise<T>;

/** 크리에이터 — 아래 책들을 전부 소유합니다. */
let creator: string;
/** 유료 책을 구매한 독자. */
let readerA: string;
/** 아무것도 사지 않은 독자. */
let readerB: string;

let paidBook: string;
let freeBook: string;
let privateBook: string;

/** 유료 책의 두 번째 published 챕터 — 미리보기에 걸리지 않습니다. */
let paidChapter: string;
/** 유료 책의 맨 앞 published 챕터 — 누구에게나 열립니다. */
let previewChapter: string;
let freeChapter: string;
/** 발행된 유료 책 안의 미발행 챕터. */
let draftChapter: string;

const PAID_BLOCK = "aaaaaaaa-0000-0000-0000-000000000001";
const FREE_BLOCK = "aaaaaaaa-0000-0000-0000-000000000002";

async function seedUser(email: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
    [email],
  );
  return result.rows[0].id;
}

async function seedBook(
  owner: string,
  title: string,
  fields: { price: number; status: string; visibility: string },
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO books (owner_id, title, price, status, visibility)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [owner, title, fields.price, fields.status, fields.visibility],
  );
  return result.rows[0].id;
}

/**
 * order_index를 반드시 받습니다. 미리보기 정책이 "published 챕터 중
 * 맨 앞"을 고르므로, 순서가 애매하면 어느 챕터가 열리는지도 애매해집니다.
 * 실제 저작 경로도 항상 순서를 명시합니다.
 */
async function seedChapter(
  bookId: string,
  slug: string,
  status: "draft" | "published",
  orderIndex: number,
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO chapters (book_id, title, slug, content_html, status, order_index)
     VALUES ($1, $2, $3, '<p>본문</p>', $4, $5) RETURNING id`,
    [bookId, slug, slug, status, orderIndex],
  );
  return result.rows[0].id;
}

async function seedBlock(
  blockId: string,
  bookId: string,
  chapterId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO workbook_blocks (id, book_id, chapter_id, block_type)
     VALUES ($1, $2, $3, 'reflection')`,
    [blockId, bookId, chapterId],
  );
  await db.query(
    `INSERT INTO workbook_block_fields (block_id, field_key, label, input_type)
     VALUES ($1, 'answer', '무엇을 배웠나요?', 'longtext')`,
    [blockId],
  );
}

beforeAll(async () => {
  db = await createSchemaTestDb();
  ({ asUser, asAnon } = makeRoleRunners(db));

  creator = await seedUser("creator@example.com");
  readerA = await seedUser("reader-a@example.com");
  readerB = await seedUser("reader-b@example.com");

  paidBook = await seedBook(creator, "유료 워크북", {
    price: 9900,
    status: "published",
    visibility: "public",
  });
  freeBook = await seedBook(creator, "무료 워크북", {
    price: 0,
    status: "published",
    visibility: "public",
  });
  privateBook = await seedBook(creator, "작업 중인 원고", {
    price: 0,
    status: "draft",
    visibility: "private",
  });

  // 유료 책의 맨 앞 published 챕터는 미리보기로 열립니다(00003).
  // 유료 차단을 확인하려면 그 뒤의 챕터를 봐야 합니다.
  previewChapter = await seedChapter(paidBook, "paid-ch-1", "published", 0);
  paidChapter = await seedChapter(paidBook, "paid-ch-2", "published", 1);
  freeChapter = await seedChapter(freeBook, "free-ch-1", "published", 0);
  draftChapter = await seedChapter(paidBook, "paid-ch-3", "draft", 2);
  await seedChapter(privateBook, "private-ch-1", "published", 0);

  await seedBlock(PAID_BLOCK, paidBook, paidChapter);
  await seedBlock(FREE_BLOCK, freeBook, freeChapter);

  // 독자 A만 유료 책을 샀습니다.
  await db.query(
    `INSERT INTO purchases (user_id, book_id, price_paid, status)
     VALUES ($1, $2, 9900, 'completed')`,
    [readerA, paidBook],
  );

  // 독자 A가 유료 책 워크북에 답을 남겼습니다.
  await db.query(
    `INSERT INTO workbook_responses
       (user_id, book_id, chapter_id, block_id, field_key, value_text)
     VALUES ($1, $2, $3, $4, 'answer', '독자 A의 사적인 메모')`,
    [readerA, paidBook, paidChapter, PAID_BLOCK],
  );
}, 60_000);

async function countRows(sql: string, params: unknown[] = []): Promise<number> {
  const result = await db.query(sql, params);
  return result.rows.length;
}

/**
 * 아래 테스트들이 헛돌지 않는지 먼저 확인합니다.
 *
 * 롤 전환이 안 걸리면 모든 쿼리가 테이블 소유자로 돌아 RLS를 통째로
 * 우회합니다. 그러면 "막힌다" 검증은 통과할 수도, 실패할 수도 있지만
 * 어느 쪽이든 정책을 본 게 아닙니다. 그런 상태를 눈치채지 못한 채
 * 초록불만 보는 일이 없도록 하네스를 직접 겁니다.
 */
describe("하네스 점검", () => {
  it("asUser가 실제로 authenticated 롤로 갈아탄다", async () => {
    const identity = await asUser(readerA, async () => {
      const result = await db.query<{ role: string; uid: string }>(
        `SELECT current_user AS role, auth.uid()::text AS uid`,
      );
      return result.rows[0];
    });

    expect(identity).toEqual({ role: "authenticated", uid: readerA });
  });

  it("asAnon은 anon 롤이고 auth.uid()가 비어 있다", async () => {
    const identity = await asAnon(async () => {
      const result = await db.query<{ role: string; uid: string | null }>(
        `SELECT current_user AS role, auth.uid()::text AS uid`,
      );
      return result.rows[0];
    });

    expect(identity).toEqual({ role: "anon", uid: null });
  });

  it("롤을 안 갈아타면 RLS를 우회한다 — 그래서 헬퍼를 반드시 거쳐야 한다", async () => {
    // 아래 "다른 독자의 응답은 보이지 않는다"가 정말 정책 때문에 막히는지
    // 확인하는 대조군입니다. 소유자 연결에서는 같은 행이 그대로 보입니다.
    const seenAsOwner = await countRows(
      `SELECT 1 FROM workbook_responses WHERE block_id = $1`,
      [PAID_BLOCK],
    );
    const seenAsOtherReader = await asUser(readerB, () =>
      countRows(`SELECT 1 FROM workbook_responses WHERE block_id = $1`, [
        PAID_BLOCK,
      ]),
    );

    expect(seenAsOwner).toBeGreaterThan(0);
    expect(seenAsOtherReader).toBe(0);
  });

  it("호출이 끝나면 롤이 원래대로 돌아온다", async () => {
    await asUser(readerA, async () => {});

    const result = await db.query<{ role: string }>(
      `SELECT current_user AS role`,
    );
    expect(result.rows[0].role).toBe("postgres");
  });
});

describe("책 노출", () => {
  it("비로그인은 발행된 공개 책만 본다", async () => {
    const titles = await asAnon(async () => {
      const result = await db.query<{ title: string }>(
        `SELECT title FROM books ORDER BY title`,
      );
      return result.rows.map((row) => row.title);
    });

    expect(titles).toEqual(["무료 워크북", "유료 워크북"]);
  });

  it("크리에이터는 자기 미발행 원고를 본다", async () => {
    const found = await asUser(creator, () =>
      countRows(`SELECT 1 FROM books WHERE id = $1`, [privateBook]),
    );
    expect(found).toBe(1);
  });

  it("남의 미발행 원고는 보이지 않는다", async () => {
    const found = await asUser(readerA, () =>
      countRows(`SELECT 1 FROM books WHERE id = $1`, [privateBook]),
    );
    expect(found).toBe(0);
  });

  it("남의 책 가격을 바꿀 수 없다", async () => {
    const affected = await asUser(readerB, async () => {
      const result = await db.query(`UPDATE books SET price = 0 WHERE id = $1`, [
        paidBook,
      ]);
      return result.affectedRows;
    });

    expect(affected).toBe(0);

    const price = await db.query<{ price: number }>(
      `SELECT price FROM books WHERE id = $1`,
      [paidBook],
    );
    expect(price.rows[0].price).toBe(9900);
  });
});

describe("챕터 접근", () => {
  it("비로그인도 무료 공개 책 챕터를 읽는다", async () => {
    const found = await asAnon(() =>
      countRows(`SELECT 1 FROM chapters WHERE id = $1`, [freeChapter]),
    );
    expect(found).toBe(1);
  });

  it("비구매자는 유료 책 챕터를 읽지 못한다", async () => {
    const found = await asUser(readerB, () =>
      countRows(`SELECT 1 FROM chapters WHERE id = $1`, [paidChapter]),
    );
    expect(found).toBe(0);
  });

  it("비로그인은 유료 책 챕터를 읽지 못한다", async () => {
    const found = await asAnon(() =>
      countRows(`SELECT 1 FROM chapters WHERE id = $1`, [paidChapter]),
    );
    expect(found).toBe(0);
  });

  it("구매자는 유료 책 챕터를 읽는다", async () => {
    const found = await asUser(readerA, () =>
      countRows(`SELECT 1 FROM chapters WHERE id = $1`, [paidChapter]),
    );
    expect(found).toBe(1);
  });

  it("구매자도 미발행 챕터는 읽지 못한다", async () => {
    const found = await asUser(readerA, () =>
      countRows(`SELECT 1 FROM chapters WHERE id = $1`, [draftChapter]),
    );
    expect(found).toBe(0);
  });

  it("소유자는 미발행 챕터를 읽는다", async () => {
    const found = await asUser(creator, () =>
      countRows(`SELECT 1 FROM chapters WHERE id = $1`, [draftChapter]),
    );
    expect(found).toBe(1);
  });
});

/**
 * 유료 책의 첫 챕터 미리보기 (마이그레이션 00003).
 *
 * 열리는 것은 **맨 앞 published 챕터 하나뿐**입니다. 여기서 한 칸이라도
 * 더 새면 유료 콘텐츠가 공짜가 됩니다.
 */
describe("첫 챕터 미리보기", () => {
  it("비로그인도 유료 책의 첫 챕터를 읽는다", async () => {
    const found = await asAnon(() =>
      countRows(`SELECT 1 FROM chapters WHERE id = $1`, [previewChapter]),
    );
    expect(found).toBe(1);
  });

  it("첫 챕터 하나만 열린다 — 나머지는 그대로 막힌다", async () => {
    const found = await asAnon(() =>
      countRows(`SELECT 1 FROM chapters WHERE book_id = $1`, [paidBook]),
    );
    expect(found).toBe(1);
  });

  it("미발행 챕터는 맨 앞이어도 미리보기가 되지 않는다", async () => {
    const draftOnly = await seedBook(creator, "초안만 있는 유료 책", {
      price: 9900,
      status: "published",
      visibility: "public",
    });
    await seedChapter(draftOnly, "draft-first", "draft", 0);

    const found = await asAnon(() =>
      countRows(`SELECT 1 FROM chapters WHERE book_id = $1`, [draftOnly]),
    );
    expect(found).toBe(0);
  });

  it("비공개 책은 미리보기도 열리지 않는다", async () => {
    const found = await asAnon(() =>
      countRows(`SELECT 1 FROM chapters WHERE book_id = $1`, [privateBook]),
    );
    expect(found).toBe(0);
  });

  it("미리보기 챕터의 워크북 문항은 열리지 않는다 — 응답을 받을 곳이 아니다", async () => {
    const previewBlock = "33333333-3333-4333-8333-333333333333";
    await seedBlock(previewBlock, paidBook, previewChapter);

    const found = await asAnon(() =>
      countRows(`SELECT 1 FROM workbook_blocks WHERE id = $1`, [previewBlock]),
    );
    expect(found).toBe(0);
  });

  it("남의 책에 챕터를 넣을 수 없다", async () => {
    await expect(
      asUser(readerB, () =>
        db.query(
          `INSERT INTO chapters (book_id, title, slug, content_html)
           VALUES ($1, '무단 챕터', 'intruder', '<p>x</p>')`,
          [paidBook],
        ),
      ),
    ).rejects.toThrow();
  });
});


/**
 * 책 목차 (마이그레이션 00011, 코드 리뷰 7-P1-8).
 *
 * 사지 않은 독자도 공개된 장의 **제목**은 봅니다. 본문은 여전히 미리보기
 * 장 하나뿐이어야 합니다 — 함수가 제목을 여는 사이 chapters 정책이
 * 넓어지지 않았는지 함께 봅니다.
 */
describe("책 목차 (00011)", () => {
  let tocBook: string;
  let hiddenBook: string;

  beforeAll(async () => {
    tocBook = await seedBook(creator, "목차 확인용 유료 책", {
      price: 9900,
      status: "published",
      visibility: "public",
    });
    await seedChapter(tocBook, "toc-2", "published", 1);
    await seedChapter(tocBook, "toc-1", "published", 0);
    await seedChapter(tocBook, "toc-draft", "draft", 2);
    await seedChapter(tocBook, "toc-3", "published", 3);

    hiddenBook = await seedBook(creator, "내린 유료 책", {
      price: 9900,
      status: "archived",
      visibility: "private",
    });
    await seedChapter(hiddenBook, "hidden-1", "published", 0);
    await db.query(
      `INSERT INTO purchases (user_id, book_id, price_paid, status)
       VALUES ($1, $2, 9900, 'completed')`,
      [readerA, hiddenBook],
    );
  });

  async function toc(bookId: string): Promise<string[]> {
    const result = await db.query<{ slug: string }>(
      `SELECT slug FROM public.book_table_of_contents($1)`,
      [bookId],
    );
    return result.rows.map((row) => row.slug);
  }

  it("비로그인도 공개 유료 책의 published 장 제목을 순서대로 본다", async () => {
    expect(await asAnon(() => toc(tocBook))).toEqual(["toc-1", "toc-2", "toc-3"]);
  });

  it("draft 장은 소유자에게도 목차에 나오지 않는다", async () => {
    expect(await asUser(creator, () => toc(tocBook))).not.toContain("toc-draft");
  });

  it("본문은 함수로 열리지 않는다 — 장 행은 여전히 미리보기 하나뿐", async () => {
    await expect(
      asAnon(() => db.query(`SELECT content_html FROM public.book_table_of_contents($1)`, [tocBook])),
    ).rejects.toThrow();
    const found = await asAnon(() =>
      countRows(`SELECT 1 FROM chapters WHERE book_id = $1`, [tocBook]),
    );
    expect(found).toBe(1);
  });

  it("공개 중이 아닌 책은 사지 않은 사람에게 목차가 없다", async () => {
    expect(await asAnon(() => toc(hiddenBook))).toEqual([]);
    expect(await asUser(readerB, () => toc(hiddenBook))).toEqual([]);
    expect(await asAnon(() => toc(privateBook))).toEqual([]);
  });

  it("내린 책도 산 독자에게는 목차가 있다", async () => {
    expect(await asUser(readerA, () => toc(hiddenBook))).toEqual(["hidden-1"]);
  });
});

describe("워크북 블록 정의", () => {
  it("비구매자는 유료 책의 문항을 읽지 못한다 — 문항만 훔쳐가는 경로를 막는다", async () => {
    const blocks = await asUser(readerB, () =>
      countRows(`SELECT 1 FROM workbook_blocks WHERE id = $1`, [PAID_BLOCK]),
    );
    const fields = await asUser(readerB, () =>
      countRows(`SELECT 1 FROM workbook_block_fields WHERE block_id = $1`, [
        PAID_BLOCK,
      ]),
    );

    expect(blocks).toBe(0);
    expect(fields).toBe(0);
  });

  it("구매자는 문항을 읽는다", async () => {
    const labels = await asUser(readerA, async () => {
      const result = await db.query<{ label: string }>(
        `SELECT label FROM workbook_block_fields WHERE block_id = $1`,
        [PAID_BLOCK],
      );
      return result.rows.map((row) => row.label);
    });

    expect(labels).toEqual(["무엇을 배웠나요?"]);
  });

  it("비로그인도 무료 책의 문항은 읽는다", async () => {
    const found = await asAnon(() =>
      countRows(`SELECT 1 FROM workbook_block_fields WHERE block_id = $1`, [
        FREE_BLOCK,
      ]),
    );
    expect(found).toBe(1);
  });

  it("독자는 남의 책에 블록을 넣을 수 없다", async () => {
    await expect(
      asUser(readerA, () =>
        db.query(
          `INSERT INTO workbook_blocks (id, book_id, chapter_id, block_type)
           VALUES ('bbbbbbbb-0000-0000-0000-000000000001', $1, $2, 'reflection')`,
          [paidBook, paidChapter],
        ),
      ),
    ).rejects.toThrow();
  });

  it("독자는 문항 텍스트를 고칠 수 없다", async () => {
    const affected = await asUser(readerA, async () => {
      const result = await db.query(
        `UPDATE workbook_block_fields SET label = '바꿔치기' WHERE block_id = $1`,
        [PAID_BLOCK],
      );
      return result.affectedRows;
    });

    expect(affected).toBe(0);
  });

  it("소유자는 문항을 고칠 수 있다", async () => {
    const affected = await asUser(creator, async () => {
      const result = await db.query(
        `UPDATE workbook_block_fields SET label = '무엇을 배웠나요?' WHERE block_id = $1`,
        [PAID_BLOCK],
      );
      return result.affectedRows;
    });

    expect(affected).toBe(1);
  });
});

describe("독자 응답", () => {
  it("작성자 본인만 자기 응답을 읽는다", async () => {
    const mine = await asUser(readerA, async () => {
      const result = await db.query<{ value_text: string }>(
        `SELECT value_text FROM workbook_responses WHERE block_id = $1`,
        [PAID_BLOCK],
      );
      return result.rows;
    });

    expect(mine).toEqual([{ value_text: "독자 A의 사적인 메모" }]);
  });

  it("다른 독자의 응답은 보이지 않는다", async () => {
    const found = await asUser(readerB, () =>
      countRows(`SELECT 1 FROM workbook_responses WHERE block_id = $1`, [
        PAID_BLOCK,
      ]),
    );
    expect(found).toBe(0);
  });

  it("크리에이터도 응답 원문을 볼 수 없다 — 집계 함수로만 조회한다", async () => {
    const found = await asUser(creator, () =>
      countRows(`SELECT 1 FROM workbook_responses WHERE book_id = $1`, [paidBook]),
    );
    expect(found).toBe(0);
  });

  it("남의 응답을 고칠 수 없다", async () => {
    const affected = await asUser(readerB, async () => {
      const result = await db.query(
        `UPDATE workbook_responses SET value_text = '조작' WHERE block_id = $1`,
        [PAID_BLOCK],
      );
      return result.affectedRows;
    });

    expect(affected).toBe(0);

    const stored = await db.query<{ value_text: string }>(
      `SELECT value_text FROM workbook_responses WHERE block_id = $1`,
      [PAID_BLOCK],
    );
    expect(stored.rows[0].value_text).toBe("독자 A의 사적인 메모");
  });

  it("남의 응답을 지울 수 없다", async () => {
    const affected = await asUser(readerB, async () => {
      const result = await db.query(
        `DELETE FROM workbook_responses WHERE block_id = $1`,
        [PAID_BLOCK],
      );
      return result.affectedRows;
    });

    expect(affected).toBe(0);
  });

  it("다른 사람 이름으로 응답을 남길 수 없다", async () => {
    await expect(
      asUser(readerB, () =>
        db.query(
          `INSERT INTO workbook_responses
             (user_id, book_id, chapter_id, block_id, field_key, value_text)
           VALUES ($1, $2, $3, $4, 'impersonated', '사칭')`,
          [readerA, paidBook, paidChapter, PAID_BLOCK],
        ),
      ),
    ).rejects.toThrow();
  });

  it("접근 권한이 없는 책에는 응답을 남길 수 없다", async () => {
    await expect(
      asUser(readerB, () =>
        db.query(
          `INSERT INTO workbook_responses
             (user_id, book_id, chapter_id, block_id, field_key, value_text)
           VALUES ($1, $2, $3, $4, 'answer', '몰래 쓴 답')`,
          [readerB, paidBook, paidChapter, PAID_BLOCK],
        ),
      ),
    ).rejects.toThrow();
  });

  it("구매자는 자기 응답을 남기고 고칠 수 있다", async () => {
    await db.query(
      `INSERT INTO workbook_block_fields (block_id, field_key, label, input_type)
       VALUES ($1, 'second', '두 번째 질문', 'longtext')`,
      [PAID_BLOCK],
    );
    await asUser(readerA, () =>
      db.query(
        `INSERT INTO workbook_responses
           (user_id, book_id, chapter_id, block_id, field_key, value_text)
         VALUES ($1, $2, $3, $4, 'second', '두 번째 답')`,
        [readerA, paidBook, paidChapter, PAID_BLOCK],
      ),
    );

    const affected = await asUser(readerA, async () => {
      const result = await db.query(
        `UPDATE workbook_responses SET value_text = '고친 답'
         WHERE block_id = $1 AND field_key = 'second'`,
        [PAID_BLOCK],
      );
      return result.affectedRows;
    });

    expect(affected).toBe(1);
  });

  it("비로그인은 무료 책이라도 응답을 남길 수 없다", async () => {
    await expect(
      asAnon(() =>
        db.query(
          `INSERT INTO workbook_responses
             (user_id, book_id, chapter_id, block_id, field_key, value_text)
           VALUES ($1, $2, $3, $4, 'answer', '익명 답')`,
          [readerB, freeBook, freeChapter, FREE_BLOCK],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("크리에이터 집계", () => {
  it("소유자는 자기 책의 응답자 수를 본다", async () => {
    const stats = await asUser(creator, async () => {
      const result = await db.query<{
        field_key: string;
        respondent_count: number;
      }>(
        `SELECT field_key, respondent_count
         FROM workbook_response_stats($1) ORDER BY field_key`,
        [paidBook],
      );
      return result.rows;
    });

    expect(stats).toEqual([
      { field_key: "answer", respondent_count: 1 },
      { field_key: "second", respondent_count: 1 },
    ]);
  });

  /**
   * 미리보기가 리더를 그대로 띄우고 소유자는 응답을 저장할 수 있습니다.
   * 그래서 저자가 자기 책을 확인하며 넣은 입력이 실제 응답 행이 됩니다.
   * 세는 쪽에서 빼지 않으면 독자가 0명인 책이 "1명 응답"으로 보입니다.
   */
  it("저자 본인의 응답은 집계에 넣지 않는다", async () => {
    await db.query(
      `INSERT INTO workbook_responses
         (user_id, book_id, chapter_id, block_id, field_key, value_text)
       VALUES ($1, $2, $3, $4, 'answer', '저자가 미리보기에서 쓴 답')`,
      [creator, paidBook, paidChapter, PAID_BLOCK],
    );

    try {
      const stats = await asUser(creator, async () => {
        const result = await db.query<{
          respondent_count: number;
          answered_count: number;
        }>(
          `SELECT respondent_count, answered_count
           FROM workbook_response_stats($1) WHERE field_key = 'answer'`,
          [paidBook],
        );
        return result.rows[0];
      });

      // 답을 쓴 사람은 독자 A 하나뿐입니다.
      expect(stats).toEqual({ respondent_count: 1, answered_count: 1 });
    } finally {
      await db.query(
        `DELETE FROM workbook_responses WHERE user_id = $1 AND book_id = $2`,
        [creator, paidBook],
      );
    }
  });

  it("집계 결과에 응답 원문이 들어 있지 않다", async () => {
    const columns = await asUser(creator, async () => {
      const result = await db.query(
        `SELECT * FROM workbook_response_stats($1) LIMIT 1`,
        [paidBook],
      );
      return result.fields.map((field) => field.name);
    });

    expect(columns).not.toContain("value_text");
    expect(columns).toEqual([
      "chapter_id",
      "block_id",
      "field_key",
      "respondent_count",
      "answered_count",
    ]);
  });

  it("남의 책 집계는 거부한다", async () => {
    await expect(
      asUser(readerA, () =>
        db.query(`SELECT * FROM workbook_response_stats($1)`, [paidBook]),
      ),
    ).rejects.toThrow();
  });

  it("비로그인은 집계 함수를 실행할 수 없다", async () => {
    await expect(
      asAnon(() =>
        db.query(`SELECT * FROM workbook_response_stats($1)`, [paidBook]),
      ),
    ).rejects.toThrow();
  });
});

describe("프로필", () => {
  it("저자 표시명은 누구나 읽는다", async () => {
    const found = await asAnon(() =>
      countRows(`SELECT 1 FROM user_profiles WHERE user_id = $1`, [creator]),
    );
    expect(found).toBe(1);
  });

  it("남의 프로필을 고칠 수 없다", async () => {
    const affected = await asUser(readerB, async () => {
      const result = await db.query(
        `UPDATE user_profiles SET display_name = '사칭' WHERE user_id = $1`,
        [creator],
      );
      return result.affectedRows;
    });

    expect(affected).toBe(0);
  });

  it("프로필 행을 직접 만들 수 없다 — 생성 경로는 트리거뿐이다", async () => {
    await expect(
      asUser(readerB, () =>
        db.query(
          `INSERT INTO user_profiles (user_id, display_name) VALUES ($1, '중복')`,
          [readerB],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("구매 기록", () => {
  it("남의 구매 내역은 보이지 않는다", async () => {
    const found = await asUser(readerB, () =>
      countRows(`SELECT 1 FROM purchases WHERE user_id = $1`, [readerA]),
    );
    expect(found).toBe(0);
  });

  it("판매자는 자기 책의 구매 기록을 본다", async () => {
    const found = await asUser(creator, () =>
      countRows(`SELECT 1 FROM purchases WHERE book_id = $1`, [paidBook]),
    );
    expect(found).toBe(1);
  });

  it("남의 이름으로 구매 기록을 만들 수 없다 — 무료 열람 경로를 막는다", async () => {
    await expect(
      asUser(readerB, () =>
        db.query(
          `INSERT INTO purchases (user_id, book_id, price_paid, status)
           VALUES ($1, $2, 0, 'completed')`,
          [readerA, freeBook],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("결제 행", () => {
  it("자기 결제 행은 읽고, 남의 결제 행은 보이지 않는다", async () => {
    // 서버가 만드는 것과 같은 자리(create_payment_request)로 심습니다.
    await db.query(`SELECT create_payment_request($1, $2, 'rls-order-1')`, [
      readerB,
      paidBook,
    ]);

    const own = await asUser(readerB, () =>
      countRows(`SELECT 1 FROM payment_transactions WHERE toss_order_id = 'rls-order-1'`),
    );
    const others = await asUser(readerA, () =>
      countRows(`SELECT 1 FROM payment_transactions WHERE toss_order_id = 'rls-order-1'`),
    );

    expect(own).toBe(1);
    expect(others).toBe(0);
  });

  it("자기 이름으로도 결제 행을 직접 만들 수 없다 — 금액 위조를 막는다 (2-P0-1)", async () => {
    // 예전에는 3만 원 책에 amount 100인 행을 넣고 Toss로 100원을
    // 결제하면 금액 대조를 그대로 통과해 구매가 생겼습니다.
    await expect(
      asUser(readerB, () =>
        db.query(
          `INSERT INTO payment_transactions (user_id, book_id, toss_order_id, amount, status)
           VALUES ($1, $2, 'rls-forged', 100, 'ready')`,
          [readerB, paidBook],
        ),
      ),
    ).rejects.toThrow();

    const found = await countRows(
      `SELECT 1 FROM payment_transactions WHERE toss_order_id = 'rls-forged'`,
    );
    expect(found).toBe(0);
  });

  it("로그인 사용자는 create_payment_request를 실행할 수 없다", async () => {
    await expect(
      asUser(readerB, () =>
        db.query(`SELECT create_payment_request($1, $2, 'rls-order-2')`, [
          readerB,
          paidBook,
        ]),
      ),
    ).rejects.toThrow();
  });
});

/**
 * 판매된 책 (마이그레이션 00006, 코드 리뷰 2-P1-1 · 4-P0-5 · 4-P1-15).
 *
 * "돈이 나갔으면 책이 열린다." 저자가 책을 내려도 산 독자는 계속 읽고
 * 답을 저장합니다. 판매·결제 기록이 있는 책은 지울 수 없습니다.
 */
describe("판매된 책 — 저자가 내린 뒤", () => {
  let soldBook: string;
  let soldPreview: string;
  let soldChapter: string;
  let refundedReader: string;
  const SOLD_BLOCK = "cccccccc-0000-4000-8000-000000000001";

  beforeAll(async () => {
    refundedReader = await seedUser("refunded@example.com");

    soldBook = await seedBook(creator, "팔린 뒤 내린 책", {
      price: 15000,
      status: "published",
      visibility: "public",
    });
    soldPreview = await seedChapter(soldBook, "sold-ch-1", "published", 0);
    soldChapter = await seedChapter(soldBook, "sold-ch-2", "published", 1);
    await seedBlock(SOLD_BLOCK, soldBook, soldChapter);

    await db.query(
      `INSERT INTO purchases (user_id, book_id, price_paid, status)
       VALUES ($1, $3, 15000, 'completed'), ($2, $3, 15000, 'refunded')`,
      [readerA, refundedReader, soldBook],
    );

    // 저자가 책을 내립니다.
    await db.query(
      `UPDATE books SET status = 'archived', visibility = 'private' WHERE id = $1`,
      [soldBook],
    );
  });

  it("구매자는 내린 책의 행을 본다 — 서재와 리더가 책 정보부터 읽는다", async () => {
    const found = await asUser(readerA, () =>
      countRows(`SELECT 1 FROM books WHERE id = $1`, [soldBook]),
    );
    expect(found).toBe(1);
  });

  it("구매자는 내린 책의 published 챕터를 전부 읽는다", async () => {
    const found = await asUser(readerA, () =>
      countRows(`SELECT 1 FROM chapters WHERE book_id = $1`, [soldBook]),
    );
    expect(found).toBe(2);
  });

  it("구매자는 내린 책의 문항을 읽고 답을 남긴다", async () => {
    const fields = await asUser(readerA, () =>
      countRows(`SELECT 1 FROM workbook_block_fields WHERE block_id = $1`, [SOLD_BLOCK]),
    );
    expect(fields).toBe(1);

    await asUser(readerA, () =>
      db.query(
        `INSERT INTO workbook_responses
           (user_id, book_id, chapter_id, block_id, field_key, value_text)
         VALUES ($1, $2, $3, $4, 'answer', '내린 뒤에도 쓴 답')`,
        [readerA, soldBook, soldChapter, SOLD_BLOCK],
      ),
    );

    const affected = await asUser(readerA, async () => {
      const result = await db.query(
        `UPDATE workbook_responses SET value_text = '고친 답'
          WHERE block_id = $1 AND user_id = $2`,
        [SOLD_BLOCK, readerA],
      );
      return result.affectedRows;
    });
    expect(affected).toBe(1);
  });

  it("비구매자와 비로그인은 내린 책을 보지 못한다 — 미리보기도 닫힌다", async () => {
    const asReader = await asUser(readerB, async () => ({
      books: await countRows(`SELECT 1 FROM books WHERE id = $1`, [soldBook]),
      chapters: await countRows(`SELECT 1 FROM chapters WHERE id IN ($1, $2)`, [
        soldPreview,
        soldChapter,
      ]),
    }));
    const asGuest = await asAnon(async () => ({
      books: await countRows(`SELECT 1 FROM books WHERE id = $1`, [soldBook]),
      chapters: await countRows(`SELECT 1 FROM chapters WHERE book_id = $1`, [soldBook]),
    }));

    expect(asReader).toEqual({ books: 0, chapters: 0 });
    expect(asGuest).toEqual({ books: 0, chapters: 0 });
  });

  it("환불된 구매자는 잃는다 — 여는 것은 completed 구매뿐이다", async () => {
    const seen = await asUser(refundedReader, async () => ({
      books: await countRows(`SELECT 1 FROM books WHERE id = $1`, [soldBook]),
      chapters: await countRows(`SELECT 1 FROM chapters WHERE book_id = $1`, [soldBook]),
    }));
    expect(seen).toEqual({ books: 0, chapters: 0 });

    await expect(
      asUser(refundedReader, () =>
        db.query(
          `INSERT INTO workbook_responses
             (user_id, book_id, chapter_id, block_id, field_key, value_text)
           VALUES ($1, $2, $3, $4, 'answer', '환불 뒤 쓴 답')`,
          [refundedReader, soldBook, soldChapter, SOLD_BLOCK],
        ),
      ),
    ).rejects.toThrow();
  });

  it("구매자에게 열린 책 행 때문에 남의 구매가 보이지는 않는다", async () => {
    const found = await asUser(readerA, () =>
      countRows(`SELECT 1 FROM purchases WHERE book_id = $1`, [soldBook]),
    );
    // 자기 구매 하나뿐. 환불된 독자의 행은 보이지 않습니다.
    expect(found).toBe(1);
  });
});

describe("판매·결제 기록이 있는 책은 지울 수 없다", () => {
  it("판매된 책 삭제는 거절되고 구매 기록이 남는다", async () => {
    const sold = await seedBook(creator, "지우려는 판매된 책", {
      price: 9900,
      status: "published",
      visibility: "public",
    });
    await seedChapter(sold, "delete-sold-ch", "published", 0);
    await db.query(
      `INSERT INTO purchases (user_id, book_id, price_paid, status)
       VALUES ($1, $2, 9900, 'completed')`,
      [readerB, sold],
    );

    await expect(
      asUser(creator, () => db.query(`DELETE FROM books WHERE id = $1`, [sold])),
    ).rejects.toThrow(/foreign key/);

    const remaining = await db.query<{ books: number; purchases: number; chapters: number }>(
      `SELECT (SELECT count(*)::int FROM books WHERE id = $1) AS books,
              (SELECT count(*)::int FROM purchases WHERE book_id = $1) AS purchases,
              (SELECT count(*)::int FROM chapters WHERE book_id = $1) AS chapters`,
      [sold],
    );
    expect(remaining.rows[0]).toEqual({ books: 1, purchases: 1, chapters: 1 });
  });

  it("결제창만 열었던 책도 결제 기록이 남아 지울 수 없다", async () => {
    const opened = await seedBook(creator, "결제창만 열린 책", {
      price: 9900,
      status: "published",
      visibility: "public",
    });
    await db.query(`SELECT create_payment_request($1, $2, 'rls-delete-ready')`, [
      readerB,
      opened,
    ]);

    await expect(
      asUser(creator, () => db.query(`DELETE FROM books WHERE id = $1`, [opened])),
    ).rejects.toThrow(/foreign key/);
  });

  it("팔린 적 없는 책은 지워지고 챕터도 함께 지워진다", async () => {
    const unsold = await seedBook(creator, "팔린 적 없는 원고", {
      price: 9900,
      status: "draft",
      visibility: "private",
    });
    await seedChapter(unsold, "unsold-ch", "published", 0);

    const affected = await asUser(creator, async () => {
      const result = await db.query(`DELETE FROM books WHERE id = $1`, [unsold]);
      return result.affectedRows;
    });

    expect(affected).toBe(1);
    expect(await countRows(`SELECT 1 FROM chapters WHERE book_id = $1`, [unsold])).toBe(0);
  });
});

/**
 * 본문 이미지 버킷 (마이그레이션 00006, 코드 리뷰 2-P1-2).
 *
 * 공개 버킷이라 파일은 공개 URL로 정책 없이 내려갑니다. SELECT 정책이
 * 열어 주던 것은 파일 목록(list)이었고, 유료 책의 이미지 파일명을 전부
 * 얻을 수 있었습니다.
 */
describe("chapter-images 파일 목록", () => {
  beforeAll(async () => {
    await db.query(
      `INSERT INTO storage.buckets (id, name, public) VALUES ('covers', 'covers', true)
       ON CONFLICT (id) DO NOTHING`,
    );
    await db.query(
      `INSERT INTO storage.objects (bucket_id, name) VALUES
         ('chapter-images', $1),
         ('chapter-images', 'not-a-book/x/stray.png'),
         ('covers', 'covers/not-a-uuid/cover.png')`,
      [`${paidBook}/${paidChapter}/secret.png`],
    );
  });

  it("비로그인은 유료 책 이미지 목록을 보지 못한다", async () => {
    const found = await asAnon(() =>
      countRows(`SELECT 1 FROM storage.objects WHERE bucket_id = 'chapter-images'`),
    );
    expect(found).toBe(0);
  });

  it("구매자도 목록은 보지 못한다 — 이미지는 본문 URL로 받는다", async () => {
    const found = await asUser(readerA, () =>
      countRows(`SELECT 1 FROM storage.objects WHERE bucket_id = 'chapter-images'`),
    );
    expect(found).toBe(0);
  });

  it("소유자는 자기 책 이미지를 본다 — Storage의 삭제·이동이 SELECT를 요구한다", async () => {
    const names = await asUser(creator, async () => {
      const result = await db.query<{ name: string }>(
        `SELECT name FROM storage.objects WHERE bucket_id = 'chapter-images'`,
      );
      return result.rows.map((row) => row.name);
    });
    expect(names).toEqual([`${paidBook}/${paidChapter}/secret.png`]);
  });

  it("첫 폴더가 uuid가 아닌 파일이 있어도 조회가 깨지지 않는다", async () => {
    // 정책이 캐스팅부터 하면 다른 버킷(covers) 조회까지 에러가 납니다.
    await expect(
      asUser(creator, () => db.query(`SELECT name FROM storage.objects`)),
    ).resolves.toBeDefined();
  });
});

/**
 * 표지 버킷 (마이그레이션 00010, 코드 리뷰 5단계 묶음 D).
 *
 * 정책이 하나도 없어 표지 업로드가 막혀 있었습니다. 경로는 covers 버킷 안의
 * covers/{bookId}/{파일명}이라, 책 ID가 두 번째 폴더입니다.
 */
describe("covers 버킷", () => {
  const coverCount = (name: string) =>
    countRows(`SELECT 1 FROM storage.objects WHERE bucket_id = 'covers' AND name = $1`, [name]);

  it("소유자는 자기 책 폴더에 표지를 올리고 지운다", async () => {
    const name = `covers/${paidBook}/owner.png`;
    await asUser(creator, () =>
      db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('covers', $1)`, [name]),
    );
    expect(await coverCount(name)).toBe(1);

    const affected = await asUser(creator, async () => {
      const result = await db.query(
        `DELETE FROM storage.objects WHERE bucket_id = 'covers' AND name = $1`,
        [name],
      );
      return result.affectedRows;
    });
    expect(affected).toBe(1);
  });

  it("남의 책 폴더에는 올리지 못한다", async () => {
    await expect(
      asUser(readerB, () =>
        db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('covers', $1)`, [
          `covers/${paidBook}/intruder.png`,
        ]),
      ),
    ).rejects.toThrow();
  });

  it("경로 규약(covers/{bookId}/…)을 벗어나면 소유자도 올리지 못한다", async () => {
    for (const name of [`${paidBook}/cover.png`, `covers/${paidBook}.png`, `other/${paidBook}/a.png`]) {
      await expect(
        asUser(creator, () =>
          db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('covers', $1)`, [name]),
        ),
      ).rejects.toThrow();
    }
  });

  it("남의 표지는 지우지도, 목록으로 보지도 못한다", async () => {
    const name = `covers/${paidBook}/kept.png`;
    await db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('covers', $1)`, [name]);

    const affected = await asUser(readerB, async () => {
      const result = await db.query(
        `DELETE FROM storage.objects WHERE bucket_id = 'covers' AND name = $1`,
        [name],
      );
      return result.affectedRows;
    });
    expect(affected).toBe(0);
    expect(await coverCount(name)).toBe(1);

    expect(
      await asUser(readerB, () =>
        countRows(`SELECT 1 FROM storage.objects WHERE bucket_id = 'covers'`),
      ),
    ).toBe(0);
    expect(
      await asAnon(() => countRows(`SELECT 1 FROM storage.objects WHERE bucket_id = 'covers'`)),
    ).toBe(0);

    const ownerSees = await asUser(creator, () =>
      countRows(`SELECT 1 FROM storage.objects WHERE bucket_id = 'covers' AND name = $1`, [name]),
    );
    expect(ownerSees).toBe(1);
  });

  it("모양이 어긋난 표지 파일이 있어도 조회가 깨지지 않는다", async () => {
    // 'covers/not-a-uuid/cover.png'는 위 chapter-images 블록이 심어 둡니다.
    await expect(
      asUser(creator, () => db.query(`SELECT name FROM storage.objects`)),
    ).resolves.toBeDefined();
  });
});

/**
 * 00008: 응답 행은 지금의 정의를 가리켜야 하고, 공개 전 장의 문항은
 * 소유자만 봅니다. 라우트(PUT /responses)가 먼저 같은 판정을 하지만,
 * PostgREST로 직접 쓰면 라우트를 건너뛰므로 정책이 마지막 방어선입니다.
 */
describe("응답 쓰기 정책과 공개 전 문항 (00008)", () => {
  const DRAFT_BLOCK = "aaaaaaaa-0000-0000-0000-000000000081";
  const SCALE_BLOCK = "aaaaaaaa-0000-0000-0000-000000000082";

  beforeAll(async () => {
    await seedBlock(DRAFT_BLOCK, paidBook, draftChapter);
    await db.query(
      `INSERT INTO workbook_blocks (id, book_id, chapter_id, block_type, config)
       VALUES ($1, $2, $3, 'scale', '{"min": 1, "max": 5}')`,
      [SCALE_BLOCK, paidBook, paidChapter],
    );
    await db.query(
      `INSERT INTO workbook_block_fields (block_id, field_key, label, input_type)
       VALUES ($1, 'value', '', 'integer')`,
      [SCALE_BLOCK],
    );
  });

  function insertAs(
    userId: string,
    values: {
      chapterId?: string;
      blockId?: string;
      fieldKey?: string;
      column?: "value_text" | "value_number" | "value_bool";
      value?: unknown;
    },
  ) {
    const column = values.column ?? "value_text";
    return asUser(userId, () =>
      db.query(
        `INSERT INTO workbook_responses
           (user_id, book_id, chapter_id, block_id, field_key, ${column})
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          paidBook,
          values.chapterId ?? paidChapter,
          values.blockId ?? PAID_BLOCK,
          values.fieldKey ?? "answer",
          values.value ?? "답",
        ],
      ),
    );
  }

  it("구매자에게 공개 전 장의 블록과 문항은 보이지 않는다", async () => {
    const seen = await asUser(readerA, async () => ({
      blocks: await countRows(`SELECT 1 FROM workbook_blocks WHERE id = $1`, [
        DRAFT_BLOCK,
      ]),
      fields: await countRows(
        `SELECT 1 FROM workbook_block_fields WHERE block_id = $1`,
        [DRAFT_BLOCK],
      ),
    }));

    expect(seen).toEqual({ blocks: 0, fields: 0 });
  });

  it("소유자는 공개 전 장의 블록과 문항을 본다", async () => {
    const seen = await asUser(creator, async () => ({
      blocks: await countRows(`SELECT 1 FROM workbook_blocks WHERE id = $1`, [
        DRAFT_BLOCK,
      ]),
      fields: await countRows(
        `SELECT 1 FROM workbook_block_fields WHERE block_id = $1`,
        [DRAFT_BLOCK],
      ),
    }));

    expect(seen).toEqual({ blocks: 1, fields: 1 });
  });

  it("구매자는 공개된 장의 문항을 계속 본다", async () => {
    const fields = await asUser(readerA, () =>
      countRows(`SELECT 1 FROM workbook_block_fields WHERE block_id = $1`, [
        PAID_BLOCK,
      ]),
    );
    expect(fields).toBeGreaterThan(0);
  });

  it("공개 전 장의 블록에는 답을 쓸 수 없다", async () => {
    await expect(
      insertAs(readerA, { chapterId: draftChapter, blockId: DRAFT_BLOCK }),
    ).rejects.toThrow(/row-level security/);
  });

  it("소유자는 공개 전 장의 블록에도 답을 쓴다 — 미리보기에서 확인하는 경로", async () => {
    await insertAs(creator, { chapterId: draftChapter, blockId: DRAFT_BLOCK });
    await db.query(`DELETE FROM workbook_responses WHERE block_id = $1`, [
      DRAFT_BLOCK,
    ]);
  });

  it("정의가 없는 문항에는 직접 쓸 수 없다", async () => {
    await expect(
      insertAs(readerA, { fieldKey: "ghost" }),
    ).rejects.toThrow(/row-level security/);
  });

  it("블록이 속하지 않은 장의 ID를 실어 쓸 수 없다", async () => {
    await expect(
      insertAs(readerA, { chapterId: previewChapter, fieldKey: "answer" }),
    ).rejects.toThrow(/row-level security/);
  });

  it("문항 타입과 다른 값 컬럼에는 쓸 수 없다", async () => {
    await expect(
      insertAs(readerA, { column: "value_bool", value: true }),
    ).rejects.toThrow(/row-level security/);
  });

  it("정수 문항에 소수는 쓸 수 없고 정수는 쓴다", async () => {
    await expect(
      insertAs(readerA, {
        blockId: SCALE_BLOCK,
        fieldKey: "value",
        column: "value_number",
        value: 3.5,
      }),
    ).rejects.toThrow(/row-level security/);

    await insertAs(readerA, {
      blockId: SCALE_BLOCK,
      fieldKey: "value",
      column: "value_number",
      value: 3,
    });
  });

  it("공백뿐인 글은 직접 쓸 수 없다 — 전각 공백도 공백이다", async () => {
    // 그대로 들어가면 집계는 "답함", 리더는 "작성 전"으로 셉니다. 판정은
    // 리더의 String.trim과 같은 문자 집합입니다.
    const notBlank = await db.query<{ blank: boolean }>(
      `SELECT public.is_blank_text($1) AS blank`,
      ["tnu 3000"],
    );
    expect(notBlank.rows[0].blank).toBe(false);
    for (const blank of [" \n\t", "\u3000", "\u00a0\ufeff"]) {
      await expect(
        insertAs(readerA, { fieldKey: "answer", value: blank }),
      ).rejects.toThrow(/row-level security/);
    }
  });

  it("답을 쓴 시각을 남길 수 있다", async () => {
    await db.query(
      `DELETE FROM workbook_responses WHERE user_id = $1 AND block_id = $2 AND field_key = 'answer'`,
      [readerA, SCALE_BLOCK],
    );
    const writtenAt = await asUser(readerA, async () => {
      await db.query(
        `UPDATE workbook_responses SET written_at = '2026-10-01T00:00:00Z'
         WHERE user_id = $1 AND block_id = $2`,
        [readerA, SCALE_BLOCK],
      );
      const result = await db.query<{ written_at: Date }>(
        `SELECT written_at FROM workbook_responses WHERE user_id = $1 AND block_id = $2`,
        [readerA, SCALE_BLOCK],
      );
      return result.rows[0]?.written_at;
    });
    expect(new Date(writtenAt!).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("직접 고쳐서 정의를 벗어나게 할 수 없다", async () => {
    await expect(
      asUser(readerA, () =>
        db.query(
          `UPDATE workbook_responses SET field_key = 'ghost'
           WHERE user_id = $1 AND block_id = $2`,
          [readerA, SCALE_BLOCK],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

/**
 * 00008: 판매된 책에서 저자가 장을 지워도 그 장에 독자가 쓴 답은 남습니다.
 * 문항을 지웠을 때 답을 남기는 것(block_id에 FK가 없는 이유)과 같은 규칙입니다.
 */
describe("장을 지워도 독자 답은 남는다 (00008)", () => {
  const DOOMED_BLOCK = "aaaaaaaa-0000-0000-0000-000000000083";
  let doomedChapter: string;

  beforeAll(async () => {
    doomedChapter = await seedChapter(paidBook, "paid-ch-doomed", "published", 5);
    await seedBlock(DOOMED_BLOCK, paidBook, doomedChapter);
    await asUser(readerA, () =>
      db.query(
        `INSERT INTO workbook_responses
           (user_id, book_id, chapter_id, block_id, field_key, value_text)
         VALUES ($1, $2, $3, $4, 'answer', '지워질 장에 쓴 답')`,
        [readerA, paidBook, doomedChapter, DOOMED_BLOCK],
      ),
    );
  });

  it("장을 지우면 답은 남고 chapter_id만 빈다", async () => {
    await asUser(creator, () =>
      db.query(`DELETE FROM chapters WHERE id = $1`, [doomedChapter]),
    );

    const rows = await asUser(readerA, async () => {
      const result = await db.query<{
        chapter_id: string | null;
        value_text: string;
      }>(
        `SELECT chapter_id, value_text FROM workbook_responses WHERE block_id = $1`,
        [DOOMED_BLOCK],
      );
      return result.rows;
    });

    expect(rows).toEqual([{ chapter_id: null, value_text: "지워질 장에 쓴 답" }]);
  });

  it("그 블록이 다른 장에 다시 동기화되면 답이 새 장을 가리킨다", async () => {
    // 잘라낸 블록을 다른 장에 붙여넣고, 그 장이 저장되기 전에 원래 장을
    // 지운 경로입니다(WP4에서 남긴 것). 붙여넣은 장이 동기화될 때 답이 따라옵니다.
    await asUser(creator, () =>
      db.query(
        `SELECT public.sync_chapter_workbook_blocks($1, $2::jsonb)`,
        [
          paidChapter,
          JSON.stringify([
            {
              id: PAID_BLOCK,
              block_type: "reflection",
              order_index: 0,
              config: {},
              fields: [
                { field_key: "answer", label: "무엇을 배웠나요?", input_type: "longtext", order_index: 0 },
                { field_key: "second", label: "두 번째 질문", input_type: "longtext", order_index: 1 },
              ],
            },
            {
              id: DOOMED_BLOCK,
              block_type: "reflection",
              order_index: 1,
              config: {},
              fields: [
                { field_key: "answer", label: "무엇을 배웠나요?", input_type: "longtext", order_index: 0 },
              ],
            },
          ]),
        ],
      ),
    );

    const chapterId = await asUser(readerA, async () => {
      const result = await db.query<{ chapter_id: string | null }>(
        `SELECT chapter_id FROM workbook_responses WHERE block_id = $1`,
        [DOOMED_BLOCK],
      );
      return result.rows[0]?.chapter_id;
    });

    expect(chapterId).toBe(paidChapter);
  });
});
