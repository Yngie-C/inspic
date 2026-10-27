// @vitest-environment node
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { OK_EMPTY, type QueryResult, type RecordedQuery } from "@/test/fake-supabase";
import { MAX_RAW_CHAPTER_HTML_LENGTH } from "@/lib/content-stats";

/**
 * 원고 업로드 라우트 (코드 리뷰 12-P0-2, 12-P2-1).
 *
 * - 원문이 너무 큰 장은 sanitize·책 생성 전에 거절합니다.
 * - DOCX 그림은 `chapter-images/{bookId}/{chapterId}/`에 올리고 그 URL을 본문에
 *   넣습니다. 장 ID는 미리 정해 그 폴더와 장 행이 같게 합니다.
 * - 책을 만든 뒤 실패하면 책과 올린 그림을 지웁니다.
 */

const USER = "user-1";
const BOOK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STORAGE = "https://project.supabase.co";

const mocks = vi.hoisted(() => ({
  respond: (() => ({ data: null, error: null })) as (query: RecordedQuery) => QueryResult,
  queries: [] as RecordedQuery[],
}));

vi.mock("@/lib/supabase/server", async () => {
  const { createFakeSupabase } = await import("@/test/fake-supabase");
  return {
    createClient: async () => {
      const fake = createFakeSupabase((query) => mocks.respond(query));
      mocks.queries = fake.queries;
      return fake.client;
    },
  };
});

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  getAuthUser: async () => ({ id: USER }),
}));

const cleanup = vi.hoisted(() => ({ removeChapterImages: vi.fn(async () => {}) }));
vi.mock("@/lib/storage-cleanup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage-cleanup")>()),
  removeChapterImages: cleanup.removeChapterImages,
}));

const { POST } = await import("./route");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/** 그림 한 장이 든 최소 .docx. */
async function docxWithImage(alt: string): Promise<File> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>",
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>",
  );
  zip.file(
    "word/_rels/document.xml.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/a.png"/>' +
      "</Relationships>",
  );
  zip.file("word/media/a.png", PNG);
  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
      ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
      ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
      ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:body><w:p><w:r><w:t>본문</w:t></w:r><w:r><w:drawing><wp:inline>' +
      `<wp:docPr id="1" name="그림" descr="${alt}"/>` +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
      '<pic:blipFill><a:blip r:embed="rIdImg"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>' +
      "</wp:inline></w:drawing></w:r></w:p></w:body></w:document>",
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new File([bytes as BlobPart], "원고.docx");
}

function uploadRequest(file: File): NextRequest {
  const form = new FormData();
  form.append("file", file);
  form.append("title", "책");
  return new Request("http://localhost/api/upload", {
    method: "POST",
    body: form,
  }) as unknown as NextRequest;
}

function find(table: string, op: string) {
  return mocks.queries.filter((q) => q.table === table && q.ops.includes(op));
}

let chapterInsert: QueryResult;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", STORAGE);
  cleanup.removeChapterImages.mockClear();
  mocks.queries = [];
  chapterInsert = { data: null, error: null };
  mocks.respond = (query) => {
    if (query.table === "books" && query.ops.includes("insert")) {
      return { data: { id: BOOK }, error: null };
    }
    if (query.table === "chapters" && query.ops.includes("insert")) {
      if (chapterInsert.error) return chapterInsert;
      const rows = query.args.insert as Array<Record<string, unknown>>;
      return { data: rows, error: null };
    }
    return OK_EMPTY;
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/upload", () => {
  it("원문이 너무 큰 장은 책을 만들기 전에 400 CONTENT_TOO_LONG (12-P0-2)", async () => {
    const huge = "<div>".repeat(MAX_RAW_CHAPTER_HTML_LENGTH / 5 + 1);
    const res = await POST(uploadRequest(new File([`# 긴 장\n\n${huge}`], "원고.md")));

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("CONTENT_TOO_LONG");
    expect(find("books", "insert")).toHaveLength(0);
  });

  it("DOCX 그림을 책·장 폴더에 올리고 그 URL을 본문에 넣는다 (12-P2-1)", async () => {
    const res = await POST(uploadRequest(await docxWithImage("매출 도표")));

    expect(res.status).toBe(201);
    const [upload] = find("storage:chapter-images", "upload");
    const path = upload.args.upload as string;
    const [row] = find("chapters", "insert")[0].args.insert as Array<Record<string, unknown>>;
    expect(path).toMatch(new RegExp(`^${BOOK}/${row.id}/[\\w-]{16}\\.png$`));
    expect(row.content_html).toContain(
      `src="${STORAGE}/storage/v1/object/public/chapter-images/${path}"`,
    );
    expect(row.content_html).not.toContain("data:");
    expect((await res.json()).data.images).toEqual({ dropped: 0 });
  });

  it("그림을 못 올리면 대체 글을 남기고 개수를 알린다", async () => {
    const respond = mocks.respond;
    mocks.respond = (query) =>
      query.table === "storage:chapter-images"
        ? { data: null, error: { message: "boom" } }
        : respond(query);

    const res = await POST(uploadRequest(await docxWithImage("매출 도표")));

    expect(res.status).toBe(201);
    const [row] = find("chapters", "insert")[0].args.insert as Array<Record<string, unknown>>;
    expect(row.content_html).not.toContain("<img");
    expect(row.content_html).toContain("매출 도표");
    expect((await res.json()).data.images).toEqual({ dropped: 1 });
  });

  it("장을 넣지 못하면 책과 올린 그림을 지운다", async () => {
    chapterInsert = { data: null, error: { message: "boom" } };

    const res = await POST(uploadRequest(await docxWithImage("매출 도표")));

    expect(res.status).toBe(500);
    expect(find("books", "delete")).toHaveLength(1);
    expect(cleanup.removeChapterImages).toHaveBeenCalledWith(BOOK, null);
  });
});
