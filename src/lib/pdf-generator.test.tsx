// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import zlib from "node:zlib";
import { BookPDF, stripHtmlForPdf } from "./pdf-generator";
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
