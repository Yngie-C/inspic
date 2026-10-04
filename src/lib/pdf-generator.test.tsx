// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import zlib from "node:zlib";
import { BookPDF, placeOrphans, stripHtmlForPdf } from "./pdf-generator";
import { applyTemplateFallback } from "./template-fallback";
import type { Book, Chapter } from "@/types";

/**
 * PDF 내보내기.
 *
 * 여기서 지키려는 것은 하나입니다: **한글이 깨진 PDF가 정상인 척 나가지
 * 않는 것.** 내장 Helvetica에는 한글 글리프가 없어서 예외 없이 렌더가
 * 끝나고 글자만 엉뚱하게 찍힙니다. 예외가 안 나므로 "PDF가 만들어졌다"는
 * 확인으로는 절대 잡히지 않습니다. 그래서 결과 바이트를 열어 폰트가
 * 실제로 임베드됐는지 봅니다.
 */

function pdfFontNames(pdf: Buffer): string[] {
  return [...pdf.toString("latin1").matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-]+)/g)]
    .map((match) => match[1])
    // 서브셋 접두사(ABCDEF+)는 렌더마다 달라집니다.
    .map((name) => name.replace(/^[A-Z]{6}\+/, ""));
}

/** 압축된 콘텐츠 스트림에서 텍스트를 그리는 명령만 모읍니다. */
function pdfTextOperators(pdf: Buffer): string {
  const chunks: string[] = [];
  for (const match of pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      chunks.push(zlib.inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"));
    } catch {
      // 폰트 파일 등 텍스트가 아닌 스트림.
    }
  }
  return chunks.filter((chunk) => chunk.includes("TJ")).join("\n");
}

const BOOK = {
  id: "book-1",
  title: "한글 제목이 있는 책",
  description: "소개글입니다",
} as Book;

function chapter(contentHtml: string): Chapter {
  return {
    id: "chapter-1",
    title: "1장 시작하기",
    content_html: contentHtml,
  } as Chapter;
}

async function render(element: ReactElement<DocumentProps>): Promise<Buffer> {
  return renderToBuffer(element);
}

describe("BookPDF 폰트", () => {
  it("한글 글리프가 있는 폰트를 임베드한다", async () => {
    const pdf = await render(
      createElement(BookPDF, {
        book: BOOK,
        chapters: [chapter("<p>이번 주에 배운 것을 적어 보세요.</p>")],
        authorName: "김작가",
      }) as ReactElement<DocumentProps>,
    );

    expect(pdfFontNames(pdf)).toContain("NotoSansKR-Regular");
  });

  /**
   * 두 웨이트의 postscript 이름이 같으면 pdfkit이 뒤엣것을 앞엣것으로
   * 덮어써서 굵은 글씨가 조용히 사라집니다. 서브셋을 다시 만들 때
   * --update-name-table을 빠뜨리면 정확히 그렇게 됩니다.
   */
  it("굵은 웨이트를 별도 폰트로 임베드한다", async () => {
    const pdf = await render(
      createElement(BookPDF, {
        book: BOOK,
        chapters: [chapter("<p>본문</p>")],
        authorName: "김작가",
      }) as ReactElement<DocumentProps>,
    );

    const names = pdfFontNames(pdf);
    expect(names).toContain("NotoSansKR-Regular");
    expect(names).toContain("NotoSansKR-Bold");
  });

  /**
   * 한글이 Helvetica로 새면 한 글자가 1바이트로 찍힙니다. 임베드 폰트로
   * 가면 글리프 인덱스 2바이트가 됩니다. 본문에 한글만 넣고, 텍스트를
   * 그리는 명령 어디에도 Helvetica가 쓰이지 않는지 봅니다.
   */
  it("본문 한글을 Helvetica로 흘리지 않는다", async () => {
    const pdf = await render(
      createElement(BookPDF, {
        book: BOOK,
        chapters: [chapter("<p>뷁 쓄 똠 훑 같은 희귀 음절도 포함합니다.</p>")],
        authorName: "김작가",
      }) as ReactElement<DocumentProps>,
    );

    // 폰트 리소스 이름(/F1 등)이 아니라 표준 폰트가 텍스트에 쓰였는지.
    expect(pdfTextOperators(pdf)).not.toContain("Helvetica");
  });
});

describe("stripHtmlForPdf 표", () => {
  /**
   * SMART 목표가 표로 나옵니다. `<tr>`을 따로 다루지 않으면 표 전체가
   * 문단 하나로 뭉쳐서 다섯 항목의 라벨과 답이 한 줄에 이어 붙습니다.
   */
  it("표의 각 줄을 라벨과 값으로 나눈다", () => {
    const blocks = stripHtmlForPdf(
      "<table><tbody>" +
        "<tr><td><strong>S</strong> 무엇을 달성할 것인가?</td><td>매일 30분 글쓰기</td></tr>" +
        "<tr><td><strong>M</strong> 어떻게 측정할 것인가?</td><td>주 5회 기록</td></tr>" +
        "</tbody></table>",
    );

    expect(blocks).toEqual([
      {
        type: "tablerow",
        text: "S 무엇을 달성할 것인가?",
        value: "매일 30분 글쓰기",
      },
      {
        type: "tablerow",
        text: "M 어떻게 측정할 것인가?",
        value: "주 5회 기록",
      },
    ]);
  });

  it("답이 비어 있어도 라벨 줄은 남긴다", () => {
    const blocks = stripHtmlForPdf(
      "<table><tbody><tr><td>A 달성 가능한가?</td><td>&nbsp;</td></tr></tbody></table>",
    );

    expect(blocks).toEqual([
      { type: "tablerow", text: "A 달성 가능한가?", value: "" },
    ]);
  });
});

describe("stripHtmlForPdf 블록 경계", () => {
  it("코드 블록을 다음 문단과 합치지 않는다", () => {
    expect(stripHtmlForPdf("<pre><code>a\nb</code></pre><p>next</p>")).toEqual([
      { type: "code", text: "a\nb" },
      { type: "paragraph", text: "next" },
    ]);
  });

  /** `<b`가 `<blockquote>`의 여는 태그까지 먹으면 콜아웃이 일반 문단이 됩니다. */
  it("뒤에 굵은 글씨가 있어도 인용을 인용으로 둔다", () => {
    expect(
      stripHtmlForPdf("<blockquote>[팁] 먼저 읽기</blockquote><p><b>굵게</b> 끝</p>"),
    ).toEqual([
      { type: "blockquote", text: "[팁] 먼저 읽기" },
      { type: "paragraph", text: "굵게 끝" },
    ]);
  });

  it("뒤에 밑줄이 있어도 목록을 목록으로 둔다", () => {
    expect(stripHtmlForPdf("<ul><li><p>항목</p></li></ul><p><u>밑줄</u></p>")).toEqual([
      { type: "listitem", text: "항목" },
      { type: "paragraph", text: "밑줄" },
    ]);
  });

  it("중첩 목록의 부모와 자식을 한 항목으로 합치지 않는다", () => {
    expect(
      stripHtmlForPdf(
        "<ul><li><p>a</p><ul><li><p>b</p></li><li><p>c</p></li></ul></li><li><p>d</p></li></ul>",
      ),
    ).toEqual([
      { type: "listitem", text: "a" },
      { type: "listitem", text: "b" },
      { type: "listitem", text: "c" },
      { type: "listitem", text: "d" },
    ]);
  });

  it("인용 안의 두 문단을 붙여 쓰지 않는다", () => {
    expect(stripHtmlForPdf("<blockquote><p>첫</p><p>둘</p></blockquote>")).toEqual([
      { type: "blockquote", text: "첫 둘" },
    ]);
  });
});

describe("stripHtmlForPdf 엔티티", () => {
  it("독자가 적은 &lt;를 한 번만 푼다", () => {
    expect(stripHtmlForPdf("<p>&amp;lt;b&amp;gt; 태그</p>")).toEqual([
      { type: "paragraph", text: "&lt;b&gt; 태그" },
    ]);
  });

  it("숫자 엔티티를 푼다", () => {
    expect(stripHtmlForPdf("<p>A&#160;B &#x2014; C</p>")).toEqual([
      { type: "paragraph", text: "A B — C" },
    ]);
  });
});

describe("답을 쓰지 않은 칸", () => {
  /** 인쇄해서 손으로 채우는 경우가 있습니다. 빈 칸이 사라지면 쓸 자리가 없습니다. */
  it("성찰의 빈 답을 쓸 자리로 남긴다", () => {
    const blocks = stripHtmlForPdf(
      applyTemplateFallback(
        '<section data-template-type="reflection" data-node-id="b" data-prompt="질문"></section>',
        { emoji: false },
      ),
    );

    expect(blocks).toEqual([
      { type: "paragraph", text: "질문" },
      { type: "answerblank", text: "" },
    ]);
  });

  it("저자가 넣은 빈 문단은 쓸 자리로 만들지 않는다", () => {
    expect(stripHtmlForPdf("<p>&nbsp;</p><p></p>")).toEqual([]);
  });
});

describe("placeOrphans", () => {
  const chapters = [{ id: "ch-1" }];

  it("실린 장의 답은 그 장에 붙인다", () => {
    const { byChapter, missingChapter } = placeOrphans(chapters, [
      { chapter_id: "ch-1", text: "실린 장" },
    ]);

    expect(byChapter.get("ch-1")).toEqual(["실린 장"]);
    expect(missingChapter).toEqual([]);
  });

  /** 저자가 공개를 내린 장은 PDF에 없어서, 장별로 모으면 답이 통째로 빠집니다. */
  it("공개를 내린 장과 지운 장의 답을 맨 뒤로 모은다", () => {
    const { byChapter, missingChapter } = placeOrphans(chapters, [
      { chapter_id: "ch-draft", text: "내린 장" },
      { chapter_id: null, text: "지운 장" },
    ]);

    expect(byChapter.size).toBe(0);
    expect(missingChapter).toEqual(["내린 장", "지운 장"]);
  });
});

describe("목차 쪽 번호", () => {
  /** 예전에는 `i + 3`으로 세서 장이 여러 쪽에 걸치면 둘째 장부터 틀렸습니다. */
  it("각 장이 실제로 시작하는 쪽을 알려 준다", async () => {
    const long = Array.from({ length: 120 }, (_, i) => `<p>${i}번째 문단입니다.</p>`).join("");
    const pages = new Map<string, number>();

    await render(
      createElement(BookPDF, {
        book: BOOK,
        chapters: [
          { ...chapter(long), id: "ch-1" },
          { ...chapter("<p>짧은 장</p>"), id: "ch-2", title: "2장" },
        ],
        authorName: "김작가",
        onChapterPage: (id: string, page: number) => {
          if (!pages.has(id)) pages.set(id, page);
        },
      }) as ReactElement<DocumentProps>,
    );

    expect(pages.get("ch-1")).toBe(3);
    expect(pages.get("ch-2")).toBeGreaterThan(4);
  });
});
