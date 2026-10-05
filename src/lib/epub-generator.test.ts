// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateEpub,
  loadStorageImage,
  toXhtml,
  type EpubImageLoader,
} from "./epub-generator";
import { applyTemplateFallback } from "./template-fallback";
import type { Book, Chapter } from "@/types";

/**
 * EPUB 장 파일은 XML로 파싱됩니다. 형식이 깨져도 내려받기는 200으로
 * 끝나므로, 여기서 XML 파서에 실제로 넣어 봅니다.
 */
function parseErrors(body: string): string | null {
  const doc = new DOMParser().parseFromString(
    `<html xmlns="http://www.w3.org/1999/xhtml"><body>${body}</body></html>`,
    "application/xhtml+xml",
  );
  return doc.getElementsByTagName("parsererror")[0]?.textContent ?? null;
}

describe("toXhtml", () => {
  it("답을 넘기지 않은 성찰·SMART 블록이 XML로 읽힌다", () => {
    const html = applyTemplateFallback(
      '<section data-template-type="reflection" data-node-id="r" data-prompt="질문"></section>' +
        '<section data-template-type="smart-goal" data-node-id="g"></section>',
    );

    expect(parseErrors(toXhtml(html))).toBeNull();
  });

  it("붙여넣은 글의 이름 엔티티를 숫자로 바꾼다", () => {
    const xhtml = toXhtml("<p>A&nbsp;B&mdash;C &unknown; &amp; D & E</p>");

    expect(parseErrors(xhtml)).toBeNull();
    expect(xhtml).toBe("<p>A&#160;B&#8212;C &amp;unknown; &amp; D &amp; E</p>");
  });

  it("sanitize가 남기는 체크박스 input을 닫는다", () => {
    const xhtml = toXhtml('<p><input type="checkbox" disabled=""> 할 일</p>');

    expect(parseErrors(xhtml)).toBeNull();
    expect(xhtml).toContain('<input type="checkbox" disabled=""/>');
  });

  it("값 없는 속성과 속성값의 <, >를 고친다", () => {
    const xhtml = toXhtml('<details open><summary>열기</summary></details><img alt="a<b>c" src="x.png">');

    expect(parseErrors(xhtml)).toBeNull();
    expect(xhtml).toContain('<details open="">');
    expect(xhtml).toContain('<img alt="a&lt;b&gt;c" src="x.png"/>');
  });
});

const BOOK = { id: "00000000-0000-0000-0000-000000000001", title: "책", language: "ko" } as Book;

function chapter(id: string, html: string): Chapter {
  return { id, title: `장 ${id}`, content_html: html } as Chapter;
}

/** 압축하지 않고(stored) 담으므로 내용이 바이트 그대로 들어 있습니다. */
function zipText(buffer: Buffer): string {
  return buffer.toString("utf8");
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("generateEpub 이미지", () => {
  /**
   * EPUB 3에서 원격으로 둘 수 있는 것은 오디오·비디오·폰트뿐입니다. 이미지
   * URL을 그대로 두면 검증에 실패하고 많은 리더기에서 빈 칸이 됩니다.
   */
  it("본문 이미지를 파일 안에 넣고 manifest에 올린다", async () => {
    const src = "https://project.supabase.co/storage/v1/object/public/chapter-images/b/c/a.png";
    const loaded: string[] = [];
    const loader: EpubImageLoader = async (url) => {
      loaded.push(url);
      return { data: PNG, mime: "image/png" };
    };

    const text = zipText(
      await generateEpub(
        BOOK,
        [chapter("1", `<p><img src="${src}" alt="그림"></p>`), chapter("2", `<img src="${src}">`)],
        "저자",
        loader,
      ),
    );

    expect(loaded).toEqual([src]);
    expect(text).toContain('<item id="image1" href="images/image-1.png" media-type="image/png"/>');
    expect(text).toContain('<img src="../images/image-1.png" alt="그림"/>');
    expect(text).toContain("OEBPS/images/image-1.png");
    expect(text).not.toContain(src);
  });

  it("담지 못한 이미지는 대체 글로 남긴다", async () => {
    const text = zipText(
      await generateEpub(
        BOOK,
        [chapter("1", '<p><img src="https://elsewhere.example/a.png" alt="바깥 그림"></p>')],
        "저자",
        async () => null,
      ),
    );

    expect(text).toContain("<span>바깥 그림</span>");
    expect(text).not.toContain("elsewhere.example");
  });
});

describe("loadStorageImage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stub() {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const fetchMock = vi.fn(async () => new Response(PNG));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("우리 Storage의 공개 이미지를 받아 온다", async () => {
    const fetchMock = stub();

    const image = await loadStorageImage(
      "https://project.supabase.co/storage/v1/object/public/chapter-images/b/c/a.png",
    );

    expect(image?.mime).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  /** 본문 `src`는 저자가 정합니다. 아무 주소나 받으면 내부망을 찌르는 통로가 됩니다. */
  it.each([
    "https://elsewhere.example/storage/v1/object/public/chapter-images/a.png",
    "http://169.254.169.254/latest/meta-data",
    "https://project.supabase.co/storage/v1/object/public/other-bucket/a.png",
    "https://project.supabase.co/rest/v1/books",
  ])("다른 곳은 받지 않는다: %s", async (src) => {
    const fetchMock = stub();

    expect(await loadStorageImage(src)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("이미지가 아닌 내용은 담지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>")));

    expect(
      await loadStorageImage(
        "https://project.supabase.co/storage/v1/object/public/chapter-images/b/c/a.png",
      ),
    ).toBeNull();
  });
});
