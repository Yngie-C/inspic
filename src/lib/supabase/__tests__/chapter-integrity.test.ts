// @vitest-environment node

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSchemaTestDb, makeRoleRunners } from "./harness";
import {
  syncChapterWorkbookBlocks,
  type WorkbookSyncClient,
} from "@/lib/workbook/sync-blocks";

/**
 * 마이그레이션 00009 — 장 저장의 정합성 (코드 리뷰 WP6).
 *
 * - 책 집계(`total_words` / `total_chapters`)는 published 장 기준으로 DB가
 *   다시 셉니다(4-P1-10).
 * - 장 `published_at`은 published가 되는 순간 DB가 찍습니다(4-P1-9).
 * - 블록 동기화는 넘겨받은 본문이 지금 DB의 본문일 때만 씁니다(4-P1-13).
 *
 * 쓰기는 실제 저장 경로처럼 소유자 롤(RLS 적용)로 합니다.
 */

let db: PGlite;
let asUser: <T>(userId: string, run: () => Promise<T>) => Promise<T>;

let owner: string;
let outsider: string;
let book: string;

const BLOCK = "33333333-3333-4333-8333-333333333333";

async function seedUser(email: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
    [email],
  );
  return result.rows[0].id;
}

async function addChapter(
  slug: string,
  status: "draft" | "published",
  wordCount: number,
  html = "<p>본문</p>",
): Promise<string> {
  return asUser(owner, async () => {
    const result = await db.query<{ id: string }>(
      `INSERT INTO chapters (book_id, title, slug, content_html, word_count, status)
       VALUES ($1, $2, $2, $3, $4, $5) RETURNING id`,
      [book, slug, html, wordCount, status],
    );
    return result.rows[0].id;
  });
}

async function updateChapter(id: string, set: string, params: unknown[] = []) {
  await asUser(owner, () =>
    db.query(`UPDATE chapters SET ${set} WHERE id = $1`, [id, ...params]),
  );
}

async function totals() {
  const result = await db.query<{ total_words: number; total_chapters: number }>(
    `SELECT total_words, total_chapters FROM books WHERE id = $1`,
    [book],
  );
  return result.rows[0];
}

async function publishedAt(id: string): Promise<string | null> {
  const result = await db.query<{ published_at: string | null }>(
    `SELECT published_at::text FROM chapters WHERE id = $1`,
    [id],
  );
  return result.rows[0].published_at;
}

/** 프로덕션의 `syncChapterWorkbookBlocks()`를 그대로 PGlite에 물립니다. */
function clientAs(userId: string): WorkbookSyncClient {
  return {
    rpc: (fn, args) =>
      asUser(userId, async () => {
        try {
          const result = await db.query<{ result: unknown }>(
            `SELECT public.${fn}($1, $2::jsonb, $3) AS result`,
            [args.p_chapter_id, JSON.stringify(args.p_blocks), args.p_content_sha256],
          );
          return { data: result.rows[0].result, error: null };
        } catch (error) {
          return { data: null, error: { message: (error as Error).message } };
        }
      }),
  };
}

function blockHtml(id: string, prompt = "이번 주에 무엇을 해 볼까요?"): string {
  return `<section data-template-type="reflection" data-node-id="${id}" data-prompt="${prompt}"></section>`;
}

async function storedBlockIds(chapterId: string): Promise<string[]> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM workbook_blocks WHERE chapter_id = $1`,
    [chapterId],
  );
  return result.rows.map((row) => row.id);
}

beforeAll(async () => {
  db = await createSchemaTestDb();
  ({ asUser } = makeRoleRunners(db));
});

beforeEach(async () => {
  await db.exec(`DELETE FROM books; DELETE FROM auth.users;`);
  owner = await seedUser("owner@example.com");
  outsider = await seedUser("outsider@example.com");
  const result = await db.query<{ id: string }>(
    `INSERT INTO books (owner_id, title) VALUES ($1, '책') RETURNING id`,
    [owner],
  );
  book = result.rows[0].id;
});

describe("책 집계 (4-P1-10)", () => {
  it("published 장만 센다", async () => {
    await addChapter("a", "published", 100);
    await addChapter("b", "draft", 50);

    expect(await totals()).toEqual({ total_words: 100, total_chapters: 1 });
  });

  it("장을 공개·비공개로 바꾸면 다시 센다", async () => {
    await addChapter("a", "published", 100);
    const b = await addChapter("b", "draft", 50);

    await updateChapter(b, "status = 'published'");
    expect(await totals()).toEqual({ total_words: 150, total_chapters: 2 });

    await updateChapter(b, "status = 'draft'");
    expect(await totals()).toEqual({ total_words: 100, total_chapters: 1 });
  });

  it("본문 글자 수가 바뀌면 그만큼 반영한다", async () => {
    const a = await addChapter("a", "published", 100);

    await updateChapter(a, "word_count = $2", [40]);

    expect(await totals()).toEqual({ total_words: 40, total_chapters: 1 });
  });

  it("장을 지우면 장 수와 글자 수를 함께 뺀다 — 예전에는 글자 수가 남았다", async () => {
    await addChapter("a", "published", 100);
    const b = await addChapter("b", "published", 70);

    await asUser(owner, () => db.query(`DELETE FROM chapters WHERE id = $1`, [b]));

    expect(await totals()).toEqual({ total_words: 100, total_chapters: 1 });
  });

  it("어긋난 값에 차이를 더하지 않고 처음부터 센다", async () => {
    // 예전 라우트는 읽은 값에 차이를 더해 덮어서, 한 번 어긋나면 계속
    // 어긋났습니다.
    await db.query(`UPDATE books SET total_words = 9999, total_chapters = 9 WHERE id = $1`, [book]);
    const a = await addChapter("a", "published", 10);

    await updateChapter(a, "word_count = $2", [20]);

    expect(await totals()).toEqual({ total_words: 20, total_chapters: 1 });
  });

  it("책을 지우면(CASCADE) 집계 트리거가 실패하지 않는다", async () => {
    await addChapter("a", "published", 10);

    await asUser(owner, () => db.query(`DELETE FROM books WHERE id = $1`, [book]));

    const left = await db.query(`SELECT 1 FROM books WHERE id = $1`, [book]);
    expect(left.rows).toHaveLength(0);
  });

  it("집계 함수는 클라이언트가 직접 부를 수 없다", async () => {
    await expect(
      asUser(outsider, () =>
        db.query(`SELECT public.refresh_book_totals($1)`, [book]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("장 출간 시각 (4-P1-9)", () => {
  it("published로 만들면 찍고, draft면 비워 둔다", async () => {
    const a = await addChapter("a", "published", 0);
    const b = await addChapter("b", "draft", 0);

    expect(await publishedAt(a)).not.toBeNull();
    expect(await publishedAt(b)).toBeNull();
  });

  it("draft를 공개하면 그때 찍는다", async () => {
    const b = await addChapter("b", "draft", 0);

    await updateChapter(b, "status = 'published'");

    expect(await publishedAt(b)).not.toBeNull();
  });

  it("내렸다 다시 올려도 처음 공개한 시각을 유지한다", async () => {
    const a = await addChapter("a", "draft", 0);
    await updateChapter(a, "status = 'published', published_at = '2026-01-01T00:00:00Z'");

    await updateChapter(a, "status = 'draft'");
    await updateChapter(a, "status = 'published'");

    expect(await publishedAt(a)).toMatch(/^2026-01-01/);
  });
});

describe("지금 본문일 때만 블록 동기화 (4-P1-13)", () => {
  it("저장한 본문 그대로면 동기화한다 — JS 해시와 SQL 해시가 같다", async () => {
    // 한글이 든 본문이어야 인코딩 차이가 드러납니다.
    const html = `<p>한글 본문 — “따옴표”</p>${blockHtml(BLOCK)}`;
    const chapter = await addChapter("a", "published", 0, html);

    const result = await syncChapterWorkbookBlocks(clientAs(owner), chapter, html);

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.stale).toBeFalsy();
    expect(await storedBlockIds(chapter)).toEqual([BLOCK]);
  });

  it("그 사이 다른 저장이 끼었으면 아무것도 쓰지 않고 stale", async () => {
    // A 저장: 본문 A를 쓰고 동기화하기 전에, B 저장이 본문을 B로 바꿈.
    const htmlA = `<p>A</p>${blockHtml(BLOCK)}`;
    const chapter = await addChapter("a", "published", 0, htmlA);
    await updateChapter(chapter, "content_html = $2", ["<p>B — 블록을 지움</p>"]);

    const result = await syncChapterWorkbookBlocks(clientAs(owner), chapter, htmlA);

    expect(result).toMatchObject({ ok: true, stale: true });
    expect(await storedBlockIds(chapter)).toEqual([]);
  });

  it("늦게 끝난 옛 동기화가 새 정의를 되돌리지 않는다", async () => {
    const htmlA = `<p>A</p>${blockHtml(BLOCK, "옛 질문")}`;
    const htmlB = `<p>B</p>${blockHtml(BLOCK, "새 질문")}`;
    const chapter = await addChapter("a", "published", 0, htmlA);

    await updateChapter(chapter, "content_html = $2", [htmlB]);
    await syncChapterWorkbookBlocks(clientAs(owner), chapter, htmlB);
    await syncChapterWorkbookBlocks(clientAs(owner), chapter, htmlA);

    const label = await db.query<{ label: string }>(
      `SELECT label FROM workbook_block_fields WHERE block_id = $1`,
      [BLOCK],
    );
    expect(label.rows.map((row) => row.label)).toEqual(["새 질문"]);
  });

  it("남의 장은 동기화하지 못한다", async () => {
    const html = blockHtml(BLOCK);
    const chapter = await addChapter("a", "published", 0, html);

    const result = await syncChapterWorkbookBlocks(clientAs(outsider), chapter, html);

    expect(result.ok).toBe(false);
    expect(await storedBlockIds(chapter)).toEqual([]);
  });
});
