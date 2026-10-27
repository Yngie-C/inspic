import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { imageFilesFrom, uploadChapterImage } from "./chapter-image-upload";

/**
 * 붙여넣기·끌어 넣기 이미지 (코드 리뷰 12-P1-9). base64로 본문에 넣지 않고
 * `chapter-images`에 올린 URL만 넣습니다.
 */

function transfer(files: File[], text: Record<string, string> = {}): DataTransfer {
  return {
    files: files as unknown as FileList,
    getData: (type: string) => text[type] ?? "",
  } as unknown as DataTransfer;
}

const png = new File([new Uint8Array([0x89, 0x50])], "a.png", { type: "image/png" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("imageFilesFrom", () => {
  it("올릴 수 있는 형식의 이미지 파일만 고른다", () => {
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    const tiff = new File(["x"], "a.tiff", { type: "image/tiff" });
    expect(imageFilesFrom(transfer([png, pdf, tiff]))).toEqual([png]);
  });

  it("글이 함께 오면 고르지 않는다 — Word·웹에서 복사한 글을 그림 한 장으로 바꾸지 않게", () => {
    expect(imageFilesFrom(transfer([png], { "text/html": "<p>글</p>" }))).toEqual([]);
    expect(imageFilesFrom(transfer([png], { "text/plain": "글" }))).toEqual([]);
    expect(imageFilesFrom(null)).toEqual([]);
  });
});

describe("uploadChapterImage", () => {
  it("장 이미지 라우트로 올리고 URL을 돌려준다", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ data: { url: "https://s/chapter-images/b/c/a.png" } }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadChapterImage("book-1", "chapter-1", png)).resolves.toBe(
      "https://s/chapter-images/b/c/a.png",
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/books/book-1/images");
    expect((init.body as FormData).get("chapterId")).toBe("chapter-1");
  });

  it("서버가 거절하면 그 문구로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "이미지는 5MB 이하만 올릴 수 있어요." }, { status: 413 })),
    );

    await expect(uploadChapterImage("b", "c", png)).rejects.toThrow("이미지는 5MB 이하만");
  });
});

describe("Image 확장 설정", () => {
  it("allowBase64: false면 붙여 넣은 HTML의 data: 이미지를 받지 않는다", () => {
    const editor = new Editor({
      extensions: [StarterKit, Image.configure({ inline: false, allowBase64: false })],
      content: '<p>앞</p><img src="data:image/png;base64,AAAA"><p>뒤</p>',
    });
    expect(editor.getHTML()).not.toContain("data:");
    editor.destroy();
  });
});
