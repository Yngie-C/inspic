import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  parseUpload,
  extractTitleFromHtml,
  parseMdToChapters,
  parseTxtToChapters,
  resolveExtension,
  splitHtmlIntoChapters,
  titleFromFileName,
} from "./upload-parser";

/**
 * 업로드 파서.
 *
 * 여기가 틀리면 크리에이터의 원고가 한 덩어리로 뭉치거나 챕터 제목이
 * 엉뚱하게 잡힌 채로 들어옵니다. 둘 다 나중에 손으로 고치는 것 말고는
 * 복구 방법이 없어서, 경계 판정만 따로 고정해 둡니다.
 */

describe("resolveExtension", () => {
  it("MIME 타입으로 판정한다", () => {
    expect(resolveExtension("text/markdown", "글.md")).toBe("md");
    expect(
      resolveExtension(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "원고.docx",
      ),
    ).toBe("docx");
  });

  it("MIME을 모르면 파일명으로 판정한다", () => {
    // 브라우저·OS에 따라 .md가 빈 문자열이나 octet-stream으로 옵니다.
    expect(resolveExtension("", "원고.md")).toBe("md");
    expect(resolveExtension("application/octet-stream", "원고.DOCX")).toBe(
      "docx",
    );
  });

  it("파일명의 확장자가 MIME보다 먼저다 — .md를 text/plain으로 보내는 환경 (5-P2-6)", () => {
    expect(resolveExtension("text/plain", "원고.md")).toBe("md");
    expect(resolveExtension("text/markdown", "원고")).toBe("md");
  });

  it("둘 다 모르면 null이다", () => {
    expect(resolveExtension("application/pdf", "원고.pdf")).toBeNull();
    expect(resolveExtension("", "확장자없음")).toBeNull();
  });
});

describe("titleFromFileName", () => {
  it("확장자를 떼고 구분자를 공백으로 바꾼다", () => {
    expect(titleFromFileName("나의-첫-워크북.md")).toBe("나의 첫 워크북");
    expect(titleFromFileName("my_book.docx")).toBe("my book");
  });

  it("점이 여러 개면 마지막 것만 확장자로 본다", () => {
    expect(titleFromFileName("v1.2-초고.txt")).toBe("v1.2 초고");
  });
});

describe("extractTitleFromHtml", () => {
  it("h1/h2를 제목으로 쓴다", () => {
    expect(extractTitleFromHtml("<h1>시작하기</h1><p>본문</p>", 0)).toBe(
      "시작하기",
    );
  });

  it("제목 안의 태그는 걷어낸다", () => {
    expect(extractTitleFromHtml("<h2><em>강조된</em> 제목</h2>", 0)).toBe(
      "강조된 제목",
    );
  });

  it("헤딩이 없으면 한국어 장 표기를 찾는다", () => {
    expect(extractTitleFromHtml("<p>제 3 장 준비운동</p>", 0)).toBe(
      "제 3 장 준비운동",
    );
  });

  it("아무것도 없으면 순번으로 만든다", () => {
    expect(extractTitleFromHtml("<p>그냥 본문</p>", 2)).toBe("Chapter 3");
  });
});

describe("splitHtmlIntoChapters", () => {
  it("헤딩마다 챕터를 나눈다", () => {
    const chapters = splitHtmlIntoChapters(
      "<h1>1장</h1><p>가</p><h1>2장</h1><p>나</p>",
      "",
    );

    expect(chapters.map((chapter) => chapter.title)).toEqual(["1장", "2장"]);
  });

  it("경계 문자열을 다음 챕터에 남긴다 — 제목을 잘라먹지 않는다", () => {
    const chapters = splitHtmlIntoChapters("<h1>1장</h1><p>가</p><h1>2장</h1>", "");

    expect(chapters[1].content_html).toContain("2장");
  });

  it("경계가 없으면 한 챕터로 둔다", () => {
    const chapters = splitHtmlIntoChapters("<p>가</p><p>나</p>", "원문");

    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("Chapter 1");
    expect(chapters[0].content_raw).toBe("원문");
  });

  it("본문을 sanitize한다", () => {
    const chapters = splitHtmlIntoChapters(
      "<h1>1장</h1><p>가</p><script>alert(1)</script>",
      "",
    );

    expect(chapters[0].content_html).not.toContain("<script>");
  });

  it("워크북 블록의 data-* 속성은 살려 둔다", () => {
    // 마크다운에 인라인 HTML로 워크북 블록이 들어올 수 있습니다.
    // data-node-id가 여기서 날아가면 그 블록은 응답을 받을 수 없습니다.
    const html =
      '<h1>1장</h1><section data-template-type="reflection" ' +
      'data-node-id="11111111-1111-4111-8111-111111111111" ' +
      'data-prompt="무엇을 배웠나요?"></section>';

    const chapters = splitHtmlIntoChapters(html, "");

    expect(chapters[0].content_html).toContain(
      'data-node-id="11111111-1111-4111-8111-111111111111"',
    );
  });
});

describe("splitHtmlIntoChapters — 경계는 한 종류만 (5-P1-1~3)", () => {
  it("헤딩 안의 장 표기가 경계로 한 번 더 걸리지 않는다", async () => {
    const chapters = await parseMdToChapters(
      "# 제1장 시작\n\n가\n\n# 제2장 심화\n\n나",
    );

    expect(chapters.map((chapter) => chapter.title)).toEqual([
      "제1장 시작",
      "제2장 심화",
    ]);
  });

  it("문장 중간의 장 표기는 문단을 자르지 않는다", () => {
    const chapters = parseTxtToChapters(
      "제 1 장 시작\n\n앞의 제2장에서 본 것처럼 Chapter 3 이야기도 있어요.",
    );

    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("제 1 장 시작");
    expect(chapters[0].content_html).toContain("앞의 제2장에서 본 것처럼");
  });

  it("h1이 있으면 h2 절마다 장을 만들지 않는다", async () => {
    const chapters = await parseMdToChapters(
      "# 1장\n\n## 절 A\n\n가\n\n## 절 B\n\n나\n\n# 2장\n\n다",
    );

    expect(chapters.map((chapter) => chapter.title)).toEqual(["1장", "2장"]);
    expect(chapters[0].content_html).toContain("절 B");
  });

  it("h1이 없으면 h2로 나눈다", async () => {
    const chapters = await parseMdToChapters("## 하나\n\n가\n\n## 둘\n\n나");

    expect(chapters.map((chapter) => chapter.title)).toEqual(["하나", "둘"]);
  });

  it("머리말 조각은 본문 속 소제목을 제목으로 집지 않는다", async () => {
    const chapters = await parseMdToChapters(
      "머리말\n\n### 이 책을 읽는 법\n\n# 1장\n\n본문",
    );

    expect(chapters.map((chapter) => chapter.title)).toEqual(["Chapter 1", "1장"]);
  });

  it("강조로 감싼 장 표기도 문단 맨 앞이면 경계다 (docx)", () => {
    const chapters = splitHtmlIntoChapters(
      "<p><strong>제1장</strong> 시작</p><p>가</p><p><strong>제2장</strong> 끝</p><p>나</p>",
      "",
    );

    expect(chapters).toHaveLength(2);
  });

  it("제목의 HTML 엔티티를 푼다 (5-P1-11)", async () => {
    const chapters = await parseMdToChapters(
      "# Q&A\n\n가\n\n# Don't & 1 < 2\n\n나",
    );

    expect(chapters.map((chapter) => chapter.title)).toEqual([
      "Q&A",
      "Don't & 1 < 2",
    ]);
  });

  it("장이 하나여도 원문 텍스트를 남긴다 (5-P2-5)", () => {
    const chapters = splitHtmlIntoChapters("<p>가 &amp; 나</p>", "");

    expect(chapters[0].content_raw).toBe("가 & 나");
  });
});

describe("parseTxtToChapters", () => {
  it("CRLF 줄바꿈도 문단으로 나눈다 (5-P1-12)", () => {
    const chapters = parseTxtToChapters(
      "제 1 장 시작\r\n\r\n첫 줄\r\n둘째 줄\r\n\r\n제 2 장 끝\r\n\r\n마지막",
    );

    expect(chapters.map((chapter) => chapter.title)).toEqual([
      "제 1 장 시작",
      "제 2 장 끝",
    ]);
    expect(chapters[0].content_html).toContain("<p>첫 줄<br>둘째 줄</p>");
    expect(chapters[0].content_html).not.toContain("\r");
  });

  it("본문의 꺾쇠는 글자로 남기고 장을 자르지 않는다 (5-P1-13)", () => {
    const chapters = parseTxtToChapters(
      "<중요> a < b\n\n<h1>가짜 제목</h1>\n\n<script>alert(1)</script>",
    );

    expect(chapters).toHaveLength(1);
    expect(chapters[0].content_html).toContain("&lt;중요&gt; a &lt; b");
    expect(chapters[0].content_html).toContain("&lt;h1&gt;가짜 제목&lt;/h1&gt;");
    expect(chapters[0].content_html).not.toContain("<script>");
  });

  it("장 표기 제목의 이스케이프도 풀어 저장한다", () => {
    const chapters = parseTxtToChapters("머리말\n\n제 1 장 A & B\n\n본문");

    expect(chapters[1].title).toBe("제 1 장 A & B");
  });

  it("빈 줄로 문단을 나누고 줄바꿈은 <br>로 만든다", () => {
    const chapters = parseTxtToChapters("첫 줄\n둘째 줄\n\n다음 문단");

    expect(chapters).toHaveLength(1);
    expect(chapters[0].content_html).toContain("첫 줄<br>둘째 줄");
    expect(chapters[0].content_html).toContain("<p>다음 문단</p>");
  });

  it("한국어 장 표기를 만나면 나눈다", () => {
    const chapters = parseTxtToChapters("머리말\n\n제 1 장 시작\n\n제 2 장 심화");

    expect(chapters.map((chapter) => chapter.title)).toEqual([
      "Chapter 1",
      "제 1 장 시작",
      "제 2 장 심화",
    ]);
  });

  it("빈 문단은 버린다", () => {
    const chapters = parseTxtToChapters("가\n\n\n\n나");

    expect(chapters[0].content_html.match(/<p>/g)).toHaveLength(2);
  });
});

describe("parseMdToChapters", () => {
  it("마크다운 헤딩마다 챕터를 나눈다", async () => {
    const chapters = await parseMdToChapters(
      "# 시작하기\n\n첫 문단\n\n# 더 나아가기\n\n둘째 문단",
    );

    expect(chapters.map((chapter) => chapter.title)).toEqual([
      "시작하기",
      "더 나아가기",
    ]);
  });

  it("h3는 챕터 경계가 아니다", async () => {
    const chapters = await parseMdToChapters("# 1장\n\n### 소제목\n\n본문");

    expect(chapters).toHaveLength(1);
  });

  it("원문을 content_raw에 남긴다", async () => {
    const source = "본문만 있는 글";
    const chapters = await parseMdToChapters(source);

    expect(chapters[0].content_raw).toBe(source);
  });
});

/**
 * 최소한의 .docx — 문단마다 스타일(Heading1 등)을 붙일 수 있습니다.
 * mammoth가 실제로 읽는 경로를 지나가게 하려고 손으로 만든 파일입니다.
 */
async function makeDocx(paragraphs: Array<{ text: string; style?: string }>) {
  const escape = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = paragraphs
    .map(
      ({ text, style }) =>
        `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}` +
        `<w:r><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`,
    )
    .join("");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
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
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${body}</w:body></w:document>`,
  );
  const buffer = await zip.generateAsync({ type: "uint8array" });
  return new Blob([buffer as BlobPart]);
}

describe("parseUpload — 실제 파일 경로", () => {
  it("docx의 Heading 1마다 장을 나누고 제목 엔티티를 푼다", async () => {
    const file = await makeDocx([
      { text: "Q&A로 시작하기", style: "Heading1" },
      { text: "앞의 제2장에서 다룬 내용" },
      { text: "절", style: "Heading2" },
      { text: "끝", style: "Heading1" },
      { text: "마지막 문단" },
    ]);

    const chapters = await parseUpload(file, "docx");

    expect(chapters.map((chapter) => chapter.title)).toEqual(["Q&A로 시작하기", "끝"]);
    expect(chapters[0].content_html).toContain("<h2>절</h2>");
  });

  it("헤딩 없는 docx는 문단 맨 앞의 장 표기로 나눈다", async () => {
    const file = await makeDocx([
      { text: "제1장 시작" },
      { text: "본문 A" },
      { text: "제2장 끝" },
      { text: "본문 B" },
    ]);

    const chapters = await parseUpload(file, "docx");

    expect(chapters.map((chapter) => chapter.title)).toEqual(["제1장 시작", "제2장 끝"]);
  });

  it("장 구분 없는 docx도 원문 텍스트를 남긴다", async () => {
    const chapters = await parseUpload(await makeDocx([{ text: "그냥 원고" }]), "docx");

    expect(chapters).toHaveLength(1);
    expect(chapters[0].content_raw).toBe("그냥 원고");
  });

  it("CRLF 마크다운 파일", async () => {
    const file = new Blob(["# 하나\r\n\r\n가\r\n\r\n# 둘\r\n\r\n나\r\n"]);

    const chapters = await parseUpload(file, "md");

    expect(chapters.map((chapter) => chapter.title)).toEqual(["하나", "둘"]);
    expect(chapters[0].content_raw).not.toContain("\r");
  });
});
