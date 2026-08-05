import { describe, expect, it } from "vitest";
import {
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

describe("parseTxtToChapters", () => {
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
