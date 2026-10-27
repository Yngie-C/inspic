// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase, type QueryResult, type RecordedQuery } from "@/test/fake-supabase";
import { clearStoredImage, replaceStoredImage, type StoredImageTarget } from "./stored-image";

/**
 * 이미지 URL 컬럼 교체·비우기 순서 (코드 리뷰 10-B). DB 행 하나를 흉내 내서
 * 조건부 갱신(옛 값이 그대로일 때만)을 실제처럼 판정합니다.
 */

const BOOK = "11111111-1111-4111-8111-111111111111";
const base = "https://project.supabase.co/storage/v1/object/public/covers/";
const OLD_PATH = `covers/${BOOK}/old.png`;
const OLD_URL = base + OLD_PATH;
const NEW_PATH = `covers/${BOOK}/new.png`;
const NEW_URL = base + NEW_PATH;

const UPLOAD = {
  ok: true as const,
  bytes: new Uint8Array([1]),
  mime: "image/png" as const,
  extension: "png",
  formData: new FormData(),
};

const target: StoredImageTarget = {
  table: "books",
  key: { column: "id", value: BOOK },
  column: "cover_image_url",
  resetColumns: ["detail_image_alt"],
  bucket: "covers",
  pathOf: (url) => (url.startsWith(`${base}covers/${BOOK}/`) ? url.slice(base.length) : null),
  notFound: "책을 찾을 수 없어요.",
  logTag: "test",
};

/** 행 하나. null이면 행이 없음(그 사이 책이 지워짐). */
let row: { cover_image_url: string | null } | null;
/** 갱신에 줄 결과를 바꿉니다. "commit-then-error"는 반영된 뒤 응답만 잃은 경우. */
let updateMode: "normal" | "error" | "commit-then-error";
let rereadError: boolean;

function guardMatches(query: RecordedQuery): boolean {
  if (!row) return false;
  const calls = query.calls ?? [];
  if (calls.some((c) => c.method === "is" && c.args[0] === target.column)) {
    return row.cover_image_url === null;
  }
  const guard = calls.find((c) => c.method === "eq" && c.args[0] === target.column);
  return guard !== undefined && row.cover_image_url === guard.args[1];
}

function respond(query: RecordedQuery): QueryResult {
  if (query.table === "books" && query.ops.includes("update")) {
    const values = query.args.update as Record<string, string | null>;
    if (updateMode === "error") return { data: null, error: { message: "db down" } };
    if (!guardMatches(query)) return { data: null, error: null };
    row = { cover_image_url: values.cover_image_url };
    if (updateMode === "commit-then-error") return { data: null, error: { message: "timeout" } };
    return { data: { id: BOOK }, error: null };
  }
  if (query.table === "books") {
    if (rereadError) return { data: null, error: { message: "db down" } };
    return { data: row, error: null };
  }
  return { data: null, error: null };
}

let user: ReturnType<typeof createFakeSupabase>;
let admin: ReturnType<typeof createFakeSupabase>;

const removed = () =>
  [...user.queries, ...admin.queries]
    .filter((q) => q.ops.includes("remove"))
    .flatMap((q) => q.args.remove as string[]);

function replace(current: string | null) {
  return replaceStoredImage({
    supabase: user.client as unknown as SupabaseClient,
    admin: admin.client as unknown as SupabaseClient,
    target,
    current,
    upload: UPLOAD,
    path: NEW_PATH,
    failed: "실패",
  });
}

function clear(current: string | null) {
  return clearStoredImage({
    admin: admin.client as unknown as SupabaseClient,
    target,
    current,
    failed: "실패",
  });
}

beforeEach(() => {
  row = { cover_image_url: OLD_URL };
  updateMode = "normal";
  rereadError = false;
  user = createFakeSupabase(respond);
  admin = createFakeSupabase(respond);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("replaceStoredImage", () => {
  it("갱신이 성공하면 옛 파일만 지우고 새 파일은 남긴다", async () => {
    const result = await replace(OLD_URL);
    expect(result).toEqual({ ok: true, value: NEW_URL });
    expect(row?.cover_image_url).toBe(NEW_URL);
    expect(removed()).toEqual([OLD_PATH]);
  });

  it("갱신과 함께 대체 글 같은 딸린 컬럼을 비운다 (P1-7)", async () => {
    await replace(OLD_URL);
    const update = admin.queries.find((q) => q.ops.includes("update"))!;
    expect(update.args.update).toEqual({ cover_image_url: NEW_URL, detail_image_alt: null });
  });

  it("그 사이 다른 요청이 바꿨으면 409, 방금 올린 파일만 지우고 행·옛 파일은 둔다 (P1-5)", async () => {
    row = { cover_image_url: base + `covers/${BOOK}/other.png` };
    const result = await replace(OLD_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(409);
    expect(row?.cover_image_url).toBe(base + `covers/${BOOK}/other.png`);
    expect(removed()).toEqual([NEW_PATH]);
  });

  it("비어 있던 행은 is null을 조건으로 건다", async () => {
    row = { cover_image_url: null };
    const result = await replace(null);
    expect(result.ok).toBe(true);
    expect(removed()).toEqual([]);
  });

  it("그 사이 행이 지워졌으면 404, 방금 올린 파일을 admin으로 지운다 (P1-11)", async () => {
    row = null;
    const result = await replace(OLD_URL);
    if (!result.ok) expect(result.response.status).toBe(404);
    expect(admin.queries.filter((q) => q.ops.includes("remove")).flatMap((q) => q.args.remove as string[]))
      .toEqual([NEW_PATH]);
  });

  it("갱신이 에러여도 다시 읽어 새 URL이면 성공으로 마무리한다 (P1-10)", async () => {
    updateMode = "commit-then-error";
    const result = await replace(OLD_URL);
    expect(result).toEqual({ ok: true, value: NEW_URL });
    expect(removed()).toEqual([OLD_PATH]);
  });

  it("갱신이 에러이고 반영되지 않았으면 새 파일을 지우고 500", async () => {
    updateMode = "error";
    const result = await replace(OLD_URL);
    if (!result.ok) expect(result.response.status).toBe(500);
    expect(removed()).toEqual([NEW_PATH]);
  });

  it("다시 읽기도 실패하면 반영 여부를 몰라 새 파일을 지우지 않는다", async () => {
    updateMode = "error";
    rereadError = true;
    const result = await replace(OLD_URL);
    if (!result.ok) expect(result.response.status).toBe(500);
    expect(removed()).toEqual([]);
  });

  it("폴더 밖 옛 URL은 지우지 않는다", async () => {
    row = { cover_image_url: "https://example.com/x.png" };
    await replace("https://example.com/x.png");
    expect(removed()).toEqual([]);
  });

  it("성공한 뒤 sweep을 부르고 새 경로를 남기게 한다", async () => {
    const sweep = vi.fn(async () => {});
    await replaceStoredImage({
      supabase: user.client as unknown as SupabaseClient,
      admin: admin.client as unknown as SupabaseClient,
      target: { ...target, sweep },
      current: OLD_URL,
      upload: UPLOAD,
      path: NEW_PATH,
      failed: "실패",
    });
    expect(sweep).toHaveBeenCalledWith(admin.client, NEW_PATH);
  });
});

describe("clearStoredImage", () => {
  it("행을 비운 뒤 파일을 지운다", async () => {
    const result = await clear(OLD_URL);
    expect(result).toEqual({ ok: true, value: true });
    expect(row?.cover_image_url).toBeNull();
    expect(removed()).toEqual([OLD_PATH]);
  });

  it("바뀐 행이 없으면 파일을 지우지 않는다 (P1-8)", async () => {
    row = { cover_image_url: NEW_URL };
    const result = await clear(OLD_URL);
    if (!result.ok) expect(result.response.status).toBe(409);
    expect(removed()).toEqual([]);
  });

  it("행이 사라졌으면 404, 파일은 그대로", async () => {
    row = null;
    const result = await clear(OLD_URL);
    if (!result.ok) expect(result.response.status).toBe(404);
    expect(removed()).toEqual([]);
  });

  it("비우기가 에러면 500, 파일은 그대로", async () => {
    updateMode = "error";
    const result = await clear(OLD_URL);
    if (!result.ok) expect(result.response.status).toBe(500);
    expect(removed()).toEqual([]);
  });

  it("이미지가 없으면 아무것도 하지 않는다", async () => {
    expect(await clear(null)).toEqual({ ok: true, value: false });
    expect(admin.queries).toEqual([]);
  });
});
