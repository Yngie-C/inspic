// @vitest-environment node
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import type { QueryResult, RecordedQuery } from "@/test/fake-supabase";

// 지울 파일 경로는 우리 Storage origin의 URL에서만 꺼냅니다(코드 리뷰 10-P1-14).
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co"));
afterEach(() => vi.unstubAllEnvs());

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
      // 테스트마다 클라이언트를 새로 만듭니다. 기록을 한 목록에 모읍니다.
      const push = fake.queries.push.bind(fake.queries);
      fake.queries.push = (...items) => {
        mocks.queries.push(...items);
        return push(...items);
      };
      return fake.client;
    },
  };
});

const { avatarStoragePath, coverStoragePath, removeBookFiles, removeChapterImages } = await import(
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

  it("이 책 폴더의 표지·소개 이미지 경로를 꺼낸다", () => {
    expect(coverStoragePath(`${base}covers/${BOOK}/1.png`, BOOK, "cover")).toBe(`covers/${BOOK}/1.png`);
    expect(coverStoragePath(`${base}covers/${BOOK}/detail-2.png`, BOOK, "detail")).toBe(
      `covers/${BOOK}/detail-2.png`,
    );
  });

  it("다른 책의 표지·다른 버킷·이상한 경로는 null", () => {
    expect(coverStoragePath(`${base}covers/${CHAPTER}/1.png`, BOOK, "cover")).toBeNull();
    expect(coverStoragePath(`${base}covers/${BOOK}/`, BOOK, "cover")).toBeNull();
    expect(coverStoragePath(`${base}covers/${BOOK}/../${CHAPTER}/1.png`, BOOK, "cover")).toBeNull();
    expect(coverStoragePath(`${base}covers/${BOOK}/%2E%2E/${CHAPTER}/1.png`, BOOK, "cover")).toBeNull();
    expect(
      coverStoragePath(
        `https://project.supabase.co/storage/v1/object/public/chapter-images/covers/${BOOK}/1.png`,
        BOOK,
        "cover",
      ),
    ).toBeNull();
    expect(coverStoragePath("표지 아님", BOOK, "cover")).toBeNull();
  });

  it("표지 칸은 소개 이미지 파일을, 소개 이미지 칸은 표지 파일을 지우지 않는다 (10-P1-13)", () => {
    expect(coverStoragePath(`${base}covers/${BOOK}/detail-2.png`, BOOK, "cover")).toBeNull();
    expect(coverStoragePath(`${base}covers/${BOOK}/1.png`, BOOK, "detail")).toBeNull();
  });

  it("우리 Storage가 아닌 origin은 경로가 같아도 null (10-P1-14)", () => {
    expect(
      coverStoragePath(
        `https://other.example/x/storage/v1/object/public/covers/covers/${BOOK}/detail-1.png`,
        BOOK,
        "detail",
      ),
    ).toBeNull();
    expect(
      coverStoragePath(`https://evil.supabase.co/storage/v1/object/public/covers/covers/${BOOK}/1.png`, BOOK, "cover"),
    ).toBeNull();
  });

  it("환경변수가 없으면 아무것도 지우지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(coverStoragePath(`${base}covers/${BOOK}/1.png`, BOOK, "cover")).toBeNull();
  });
});

describe("avatarStoragePath", () => {
  const base = "https://project.supabase.co/storage/v1/object/public/avatars/";
  const USER = "44444444-4444-4444-8444-444444444444";

  it("본인 폴더의 사진 경로를 꺼낸다", () => {
    expect(avatarStoragePath(`${base}${USER}/1.png`, USER)).toBe(`${USER}/1.png`);
  });

  it("남의 폴더·다른 버킷·외부 URL·이상한 경로는 null", () => {
    expect(avatarStoragePath(`${base}${BOOK}/1.png`, USER)).toBeNull();
    expect(avatarStoragePath(`${base}${USER}/`, USER)).toBeNull();
    expect(avatarStoragePath(`${base}${USER}/../${BOOK}/1.png`, USER)).toBeNull();
    expect(
      avatarStoragePath(
        `https://project.supabase.co/storage/v1/object/public/covers/${USER}/1.png`,
        USER,
      ),
    ).toBeNull();
    expect(avatarStoragePath(`https://example.com/${USER}/me.png`, USER)).toBeNull();
    expect(
      avatarStoragePath(`https://example.com/storage/v1/object/public/avatars/${USER}/me.png`, USER),
    ).toBeNull();
  });
});

const STORAGE = "https://project.supabase.co/storage/v1/object/public";

/** remove()가 요청받은 경로를 모두 지웠다고 답합니다. */
function removedAll(query: RecordedQuery): QueryResult {
  return { data: (query.args.remove as string[]).map((name) => ({ name })), error: null };
}

describe("removeChapterImages", () => {
  it("장 폴더에서 다른 장이 쓰지 않는 파일만 지운다", async () => {
    const kept = `${BOOK}/${CHAPTER}/kept.png`;
    mocks.respond = (query) => {
      if (query.ops.includes("list")) return { data: [file("gone.png"), file("kept.png")], error: null };
      if (query.ops.includes("remove")) return removedAll(query);
      if (query.table === "chapters") {
        return { data: [{ id: OTHER_CHAPTER, content_html: `<img src="${STORAGE}/chapter-images/${kept}">` }], error: null };
      }
      return { data: null, error: null };
    };

    await removeChapterImages(BOOK, CHAPTER);

    expect(removed()).toEqual([`${BOOK}/${CHAPTER}/gone.png`]);
    expect(mocks.queries.find((q) => q.ops.includes("list"))?.args.list).toBe(`${BOOK}/${CHAPTER}`);
  });

  it("참조 판정은 파일 수와 상관없이 책 폴더를 가리키는 장을 한 번 읽는다 (10-P1-18)", async () => {
    mocks.respond = (query) => {
      if (query.ops.includes("list")) {
        return { data: Array.from({ length: 50 }, (_, i) => file(`${i}.png`)), error: null };
      }
      if (query.ops.includes("remove")) return removedAll(query);
      return { data: [], error: null };
    };

    await removeChapterImages(BOOK, CHAPTER);

    const reads = mocks.queries.filter((q) => q.table === "chapters");
    expect(reads).toHaveLength(1);
    expect(reads[0].argLists.like[1]).toBe(`%/chapter-images/${BOOK}/%`);
    expect(removed()).toHaveLength(50);
  });

  it("남길 파일만 있으면 remove를 부르지 않는다", async () => {
    mocks.respond = (query) =>
      query.ops.includes("list")
        ? { data: [file("a.png")], error: null }
        : {
            data: [{ id: OTHER_CHAPTER, content_html: `<img src="${STORAGE}/chapter-images/${BOOK}/${CHAPTER}/a.png">` }],
            error: null,
          };

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

  it("에러 없이 지워지지 않은 파일은 로그로 남긴다 (10-P1-16)", async () => {
    mocks.respond = (query) => {
      if (query.ops.includes("list")) return { data: [file("a.png"), file("b.png")], error: null };
      if (query.ops.includes("remove")) return { data: [{ name: `${BOOK}/${CHAPTER}/a.png` }], error: null };
      return { data: [], error: null };
    };

    await removeChapterImages(BOOK, CHAPTER);

    expect(console.error).toHaveBeenCalledWith(
      "[storage] 지워지지 않은 파일이 있습니다",
      expect.objectContaining({ paths: [`${BOOK}/${CHAPTER}/b.png`] }),
    );
  });
});

describe("removeBookFiles", () => {
  it("covers 책 폴더를 통째로 비우고, 장 폴더까지 내려가 본문 이미지를 지운다 (10-P1-15)", async () => {
    mocks.respond = (query) => {
      if (query.ops.includes("list")) {
        if (query.table === "storage:covers") {
          // 행이 가리키지 않는, 예전 교체 때 남은 파일도 함께 있습니다.
          return { data: [file("1.png"), file("detail-2.png"), file("leftover.png")], error: null };
        }
        return query.args.list === BOOK
          ? { data: [folder(CHAPTER)], error: null }
          : { data: [file("a.png")], error: null };
      }
      if (query.ops.includes("remove")) return removedAll(query);
      if (query.table === "chapters") return { data: [], error: null };
      return { data: null, error: null };
    };

    await removeBookFiles(BOOK);

    const lists = mocks.queries.filter((q) => q.ops.includes("list"));
    expect(lists.find((q) => q.table === "storage:covers")?.args.list).toBe(`covers/${BOOK}`);
    const removes = mocks.queries.filter((q) => q.ops.includes("remove"));
    expect(removes.map((q) => [q.table, q.args.remove])).toEqual(
      expect.arrayContaining([
        ["storage:covers", [`covers/${BOOK}/1.png`, `covers/${BOOK}/detail-2.png`, `covers/${BOOK}/leftover.png`]],
        ["storage:chapter-images", [`${BOOK}/${CHAPTER}/a.png`]],
      ]),
    );
    expect(removes).toHaveLength(2);
  });

  it("covers 정리가 실패해도 본문 이미지는 정리하고 던지지 않는다", async () => {
    mocks.respond = (query) => {
      if (query.ops.includes("list")) {
        return query.table === "storage:covers"
          ? { data: null, error: { message: "boom" } }
          : { data: [file("a.png")], error: null };
      }
      if (query.ops.includes("remove")) return removedAll(query);
      return { data: [], error: null };
    };

    await expect(removeBookFiles(BOOK)).resolves.toBeUndefined();
    expect(removed()).toEqual([`${BOOK}/a.png`]);
  });
});
