// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createFakeSupabase,
  OK_EMPTY,
  type QueryResult,
  type RecordedQuery,
} from "@/test/fake-supabase";
import { loadPublishChecks } from "./publish-checks-loader";
import { blockers } from "./publish-checks";

/**
 * 검수 데이터 읽기 (코드 리뷰 4-P1-21, 4-P1-25, 4-P1-26).
 *
 * 판정은 `publish-checks.test.ts`가 봅니다. 여기서 보는 것은 조회 실패를
 * "없음"으로 삼키지 않는지, 블록을 끝까지 읽는지, 문항을 함께 읽는지입니다.
 */

const BOOK = "book-1";
const BLOCK_ID = "11111111-1111-4111-8111-111111111111";

const BOOK_ROW = {
  title: "책",
  description: "소개",
  cover_image_url: "c",
  price: 0,
};

function reflection(id: string) {
  return `<section data-template-type="reflection" data-node-id="${id}" data-prompt="질문"></section>`;
}

const CHAPTER_ROW = {
  id: "ch-1",
  title: "1장",
  content_html: `<p>가</p>${reflection(BLOCK_ID)}`,
  status: "published",
  order_index: 0,
};

const STORED_ROW = {
  id: BLOCK_ID,
  chapter_id: "ch-1",
  workbook_block_fields: [{ field_key: "answer", input_type: "longtext" }],
};

function load(
  respond: (query: RecordedQuery) => QueryResult,
  options?: Parameters<typeof loadPublishChecks>[2],
) {
  const fake = createFakeSupabase(respond);
  const client = fake.client as unknown as Parameters<typeof loadPublishChecks>[0];
  return { result: loadPublishChecks(client, BOOK, options), queries: fake.queries };
}

function respondWith(tables: {
  books?: QueryResult;
  chapters?: QueryResult;
  blocks?: (query: RecordedQuery) => QueryResult;
}) {
  return (query: RecordedQuery): QueryResult => {
    if (query.table === "books") return tables.books ?? { data: BOOK_ROW, error: null };
    if (query.table === "chapters") {
      return tables.chapters ?? { data: [CHAPTER_ROW], error: null };
    }
    if (query.table === "workbook_blocks") {
      return tables.blocks?.(query) ?? { data: [STORED_ROW], error: null };
    }
    return OK_EMPTY;
  };
}

describe("loadPublishChecks", () => {
  it("동기화된 책은 차단 없이 통과한다", async () => {
    const { result } = load(respondWith({}));

    const loaded = await result;
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(blockers(loaded.checks)).toEqual([]);
  });

  it("문항까지 함께 읽는다 — DB에 문항이 없으면 미동기화다 (4-P1-21)", async () => {
    const { result, queries } = load(
      respondWith({
        blocks: () => ({
          data: [{ ...STORED_ROW, workbook_block_fields: [] }],
          error: null,
        }),
      }),
    );

    const loaded = await result;
    expect(loaded.ok && blockers(loaded.checks).map((c) => c.id)).toEqual([
      "unsynced-blocks",
    ]);
    const blockQuery = queries.find((q) => q.table === "workbook_blocks");
    expect(String(blockQuery?.args.select)).toContain("workbook_block_fields");
  });

  it("책이 없으면 not-found", async () => {
    const { result } = load(respondWith({ books: OK_EMPTY }));

    expect(await result).toEqual({ ok: false, reason: "not-found" });
  });

  it.each([
    ["책", { books: { data: null, error: { message: "boom" } } }],
    ["장", { chapters: { data: null, error: { message: "boom" } } }],
    ["블록", { blocks: () => ({ data: null, error: { message: "boom" } }) }],
  ] as const)(
    "%s 조회가 실패하면 error — 거짓 차단이나 404로 보이지 않게 (4-P1-25)",
    async (_label, tables) => {
      const { result } = load(respondWith(tables));

      expect(await result).toEqual({ ok: false, reason: "error" });
    },
  );

  it("블록을 정렬된 범위로 끝까지 읽는다 (4-P1-26)", async () => {
    // 첫 페이지는 꽉 차고(1000), 둘째 페이지에 이 장의 블록이 있습니다.
    const filler = Array.from({ length: 1000 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      chapter_id: "ch-other",
      workbook_block_fields: [],
    }));
    const { result, queries } = load(
      respondWith({
        blocks: (query) => {
          const from = (query.args.range as number) ?? 0;
          return { data: from === 0 ? filler : [STORED_ROW], error: null };
        },
      }),
    );

    const loaded = await result;
    expect(loaded.ok && blockers(loaded.checks)).toEqual([]);

    const blockQueries = queries.filter((q) => q.table === "workbook_blocks");
    expect(blockQueries.map((q) => q.args.range)).toEqual([0, 1000]);
    expect(blockQueries.every((q) => q.args.order === "id")).toBe(true);
  });

  it("장 상태를 가정해 검사한다 — 마지막 공개 장을 내리면 공개 장이 없다", async () => {
    const { result } = load(respondWith({}), {
      assumeChapterStatus: { id: "ch-1", status: "draft" },
    });

    const loaded = await result;
    expect(loaded.ok && blockers(loaded.checks).map((c) => c.id)).toEqual([
      "no-published-chapters",
    ]);
  });
});
