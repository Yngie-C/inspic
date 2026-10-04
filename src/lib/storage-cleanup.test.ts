// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryResult, RecordedQuery } from "@/test/fake-supabase";

/**
 * 장·책을 지운 뒤 Storage 정리 (코드 리뷰 5-P1-7, 5-P2-11).
 *
 * 공개 버킷이라 남은 파일은 URL로 계속 열립니다. 그렇다고 다른 장 본문이
 * 아직 쓰는 파일까지 지우면 살아 있는 장의 이미지가 깨집니다.
 */

const BOOK = "11111111-1111-4111-8111-111111111111";
const CHAPTER = "22222222-2222-4222-8222-222222222222";
const OTHER_CHAPTER = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  respond: (() => ({ data: null, error: null })) as (query: RecordedQuery) => QueryResult,
  queries: [] as RecordedQuery[],
}));

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("@/test/fake-supabase");
  return {
    createAdminClient: () => {
      const fake = createFakeSupabase((query) => mocks.respond(query));
      // removeBookFiles는 클라이언트를 두 번 만듭니다. 기록을 한 목록에 모읍니다.
      const push = fake.queries.push.bind(fake.queries);
      fake.queries.push = (...items) => {
        mocks.queries.push(...items);
        return push(...items);
      };
      return fake.client;
    },
  };
});

const { coverStoragePath, removeBookFiles, removeChapterImages } = await import(
  "./storage-cleanup"
);

const file = (name: string) => ({ id: `id-${name}`, name });
const folder = (name: string) => ({ id: null, name });

function removed(): string[] {
  return mocks.queries
    .filter((q) => q.ops.includes("remove"))
    .flatMap((q) => q.args.remove as string[]);
}

beforeEach(() => {
  mocks.queries = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("coverStoragePath", () => {
  const base = "https://project.supabase.co/storage/v1/object/public/covers/";

  it("이 책 폴더의 표지 경로를 꺼낸다", () => {
    expect(coverStoragePath(`${base}covers/${BOOK}/1.png`, BOOK)).toBe(`covers/${BOOK}/1.png`);
  });

  it("다른 책의 표지·다른 버킷·이상한 경로는 null", () => {
    expect(coverStoragePath(`${base}covers/${CHAPTER}/1.png`, BOOK)).toBeNull();
    expect(coverStoragePath(`${base}covers/${BOOK}/`, BOOK)).toBeNull();
    expect(coverStoragePath(`${base}covers/${BOOK}/../${CHAPTER}/1.png`, BOOK)).toBeNull();
    expect(coverStoragePath(`${base}covers/${BOOK}/%2E%2E/${CHAPTER}/1.png`, BOOK)).toBeNull();
    expect(
      coverStoragePath(
        `https://project.supabase.co/storage/v1/object/public/chapter-images/covers/${BOOK}/1.png`,
        BOOK,
      ),
    ).toBeNull();
    expect(coverStoragePath("표지 아님", BOOK)).toBeNull();
  });
});

describe("removeChapterImages", () => {
  it("장 폴더에서 다른 장이 쓰지 않는 파일만 지운다", async () => {
    const kept = `${BOOK}/${CHAPTER}/kept.png`;
    mocks.respond = (query) => {
      if (query.ops.includes("list")) return { data: [file("gone.png"), file("kept.png")], error: null };
      if (query.table === "chapters") {
        const pattern = query.argLists.like[1] as string;
        return { data: pattern.includes(kept) ? [{ id: OTHER_CHAPTER }] : [], error: null };
      }
      return { data: null, error: null };
    };

    await removeChapterImages(BOOK, CHAPTER);

    expect(removed()).toEqual([`${BOOK}/${CHAPTER}/gone.png`]);
    expect(mocks.queries.find((q) => q.ops.includes("list"))?.args.list).toBe(`${BOOK}/${CHAPTER}`);
  });

  it("남길 파일만 있으면 remove를 부르지 않는다", async () => {
    mocks.respond = (query) =>
      query.ops.includes("list")
        ? { data: [file("a.png")], error: null }
        : { data: [{ id: OTHER_CHAPTER }], error: null };

    await removeChapterImages(BOOK, CHAPTER);
    expect(mocks.queries.some((q) => q.ops.includes("remove"))).toBe(false);
  });

  it("참조 조회가 실패하면 아무것도 지우지 않고 던지지 않는다", async () => {
    mocks.respond = (query) =>
      query.ops.includes("list")
        ? { data: [file("a.png")], error: null }
        : { data: null, error: { message: "boom" } };

    await expect(removeChapterImages(BOOK, CHAPTER)).resolves.toBeUndefined();
    expect(removed()).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("removeBookFiles", () => {
  it("책 폴더 아래 장 폴더까지 내려가 지우고, 표지도 지운다", async () => {
    mocks.respond = (query) => {
      if (query.ops.includes("list")) {
        return query.args.list === BOOK
          ? { data: [folder(CHAPTER)], error: null }
          : { data: [file("a.png")], error: null };
      }
      if (query.table === "chapters") return { data: [], error: null };
      return { data: null, error: null };
    };

    await removeBookFiles(
      BOOK,
      `https://project.supabase.co/storage/v1/object/public/covers/covers/${BOOK}/1.png`,
    );

    const removes = mocks.queries.filter((q) => q.ops.includes("remove"));
    expect(removes.map((q) => [q.table, q.args.remove])).toEqual([
      ["storage:covers", [`covers/${BOOK}/1.png`]],
      ["storage:chapter-images", [`${BOOK}/${CHAPTER}/a.png`]],
    ]);
  });
});
