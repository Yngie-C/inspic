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
