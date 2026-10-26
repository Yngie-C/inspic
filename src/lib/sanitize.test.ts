import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeContent, sanitizeForRender } from "./sanitize";

/**
 * sanitize는 챕터 저장(서버)과 렌더링(클라이언트) 양쪽에서 도는 유일한
 * XSS 방어선입니다. 동시에 워크북 블록의 `data-*` 속성을 살려 둬야
 * 하므로, "위험한 건 지우고 워크북 속성은 남긴다"를 함께 검증합니다.
 */

describe.each([
  ["sanitizeContent", sanitizeContent],
  ["sanitizeForRender", sanitizeForRender],
])("%s", (_name, sanitize) => {
  describe("스크립트 제거", () => {
    it("script 태그를 지운다", () => {
      const output = sanitize('<p>안전</p><script>alert("xss")</script>');
      expect(output).not.toContain("script");
      expect(output).toContain("안전");
    });

    it("이벤트 핸들러 속성을 지운다", () => {
      const output = sanitize('<p onclick="steal()">본문</p>');
      expect(output).not.toContain("onclick");
      expect(output).toContain("본문");
    });

    it("img의 onerror를 지운다", () => {
      const output = sanitize('<img src="x" onerror="alert(1)">');
      expect(output).not.toContain("onerror");
    });

    it("javascript: 링크를 남기지 않는다", () => {
      const output = sanitize('<a href="javascript:alert(1)">클릭</a>');
      expect(output).not.toContain("javascript:");
    });

    it("iframe을 지운다", () => {
      const output = sanitize('<iframe src="https://evil.example"></iframe>');
      expect(output).not.toContain("iframe");
    });
  });

  describe("허용 태그 유지", () => {
    it("기본 서식 태그를 남긴다", () => {
      const html =
        "<h2>제목</h2><p><strong>굵게</strong> <em>기울임</em></p><ul><li>항목</li></ul>";
      expect(sanitize(html)).toBe(html);
    });

    it("표를 남긴다", () => {
      const html = "<table><tbody><tr><td>칸</td></tr></tbody></table>";
      expect(sanitize(html)).toBe(html);
    });

    it("워크북 블록의 section을 남긴다", () => {
      const output = sanitize('<section data-template-type="checklist"></section>');
      expect(output).toContain("<section");
    });
  });

  describe("워크북 data-* 속성 보존", () => {
    it("data-node-id를 남긴다 — 이 값이 응답을 잇는 키다", () => {
      const output = sanitize(
        '<section data-template-type="reflection" data-node-id="abc-123"></section>',
      );
      expect(output).toContain('data-node-id="abc-123"');
    });

    it("체크리스트 문항 JSON을 남긴다", () => {
      const items = JSON.stringify([{ id: "a1", text: "첫 항목" }]);
      const output = sanitize(
        `<section data-template-type="checklist" data-node-id="b-1" data-items='${items}'></section>`,
      );
      expect(output).toContain("data-items");
      expect(output).toContain("첫 항목");
    });

    it("스케일 설정 속성을 남긴다", () => {
      const output = sanitize(
        '<section data-template-type="scale" data-node-id="s-1" data-min="1" data-max="5" data-label-min="낮음"></section>',
      );
      expect(output).toContain('data-min="1"');
      expect(output).toContain('data-max="5"');
      expect(output).toContain('data-label-min="낮음"');
    });
  });

  describe("에디터 서식 보존", () => {
    it("밑줄·취소선·형광펜을 남긴다", () => {
      const html = "<p><u>밑줄</u> <s>취소선</s> <mark>형광펜</mark></p>";
      expect(sanitize(html)).toBe(html);
    });

    it("문단·제목의 정렬을 남긴다", () => {
      const html =
        '<h2 style="text-align: center">제목</h2><p style="text-align: right">본문</p>';
      expect(sanitize(html)).toBe(html);
    });

    it("style에서 정렬 말고는 지운다 — 본문이 화면을 덮지 못하게", () => {
      const output = sanitize(
        '<p style="position: fixed; inset: 0; text-align: justify">본문</p>',
      );
      expect(output).toBe('<p style="text-align: justify">본문</p>');
    });

    it("정렬이 없는 style은 속성째 지운다", () => {
      expect(sanitize('<div style="position:fixed;top:0">덮개</div>')).toBe(
        "<div>덮개</div>",
      );
      expect(sanitize('<p style="text-align: expression(alert(1))">글</p>')).toBe(
        "<p>글</p>",
      );
    });

    it("새 탭 링크를 남기고 rel을 강제한다", () => {
      expect(
        sanitize('<a href="https://example.com" target="_blank" rel="noopener noreferrer">링크</a>'),
      ).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">링크</a>');
      expect(sanitize('<a href="https://example.com" target="_blank">링크</a>')).toBe(
        '<a href="https://example.com" target="_blank" rel="noopener noreferrer">링크</a>',
      );
    });

    it("새 탭이 아닌 target과 링크 밖의 target·rel은 지운다", () => {
      expect(sanitize('<a href="https://example.com" target="top" rel="opener">링크</a>')).toBe(
        '<a href="https://example.com">링크</a>',
      );
      expect(sanitize('<p target="_blank" rel="opener">글</p>')).toBe("<p>글</p>");
    });
  });

  describe("입력란 (코드 리뷰 12-P1-2·12-P1-3·12-P2-4)", () => {
    /**
     * 저장 HTML에는 입력란을 내는 곳이 없습니다. 워크북 블록은 `section` +
     * `data-*`이고 답은 `workbook_responses`에 있습니다. 본문에 남은 입력란은
     * 리더에서 살아 있는 칸으로 그려지지만 어디에도 저장되지 않습니다.
     */
    it.each([
      ['<input type="checkbox">', "[ ]"],
      ['<input disabled="" type="checkbox">', "[ ]"],
      ['<input type="checkbox" checked>', "[x]"],
      ['<input type="CHECKBOX" checked>', "[x]"],
    ])("체크 상자는 글자로 바꾼다: %s", (html, mark) => {
      expect(sanitize(`<ul><li>${html} 할 일</li></ul>`)).toBe(`<ul><li>${mark} 할 일</li></ul>`);
    });

    it.each([
      '<input type="password" name="pw">',
      '<input type="text" name="card" value="0000">',
      "<input>",
    ])("체크 상자가 아닌 input은 지운다: %s", (html) => {
      expect(sanitize(`<p>${html} 할 일</p>`)).toBe("<p> 할 일</p>");
    });

    it("다른 요소의 type·checked는 남기지 않는다", () => {
      expect(sanitize('<ol type="a"><li checked>가</li></ol>')).toBe("<ol><li>가</li></ol>");
    });

    it("textarea·label 피싱 폼을 지운다", () => {
      const output = sanitize(
        '<label for="card">카드 번호</label><textarea name="card" placeholder="0000-0000" rows="1" readonly></textarea>',
      );
      expect(output).not.toMatch(/<label|<textarea|placeholder|rows=|readonly|name=|for=/);
      expect(output).toBe("카드 번호");
    });

    it("워크북 블록 안에 끼워 넣은 input도 살아 있는 칸으로 남기지 않는다", () => {
      expect(
        sanitize('<section data-template-type="checklist" data-node-id="b-1"><input type="text"></section>'),
      ).toBe('<section data-template-type="checklist" data-node-id="b-1"></section>');
    });
  });

  describe("class (코드 리뷰 12-P1-1)", () => {
    it("Tailwind 유틸로 화면을 덮는 class를 지운다", () => {
      expect(
        sanitize('<div class="fixed inset-0 z-50 bg-surface"><p class="text-danger">결제 정보를 다시 입력해 주세요</p></div>'),
      ).toBe("<div><p>결제 정보를 다시 입력해 주세요</p></div>");
    });

    it("코드 블록의 언어 표시만 남긴다", () => {
      expect(sanitize('<pre><code class="language-ts">const a = 1;</code></pre>')).toBe(
        '<pre><code class="language-ts">const a = 1;</code></pre>',
      );
      expect(sanitize('<pre><code class="language-ts fixed">a</code></pre>')).toBe(
        "<pre><code>a</code></pre>",
      );
      expect(sanitize('<p class="language-ts">a</p>')).toBe("<p>a</p>");
    });
  });

  describe("업로드가 내는 서식 (코드 리뷰 12-P1-4·12-P1-5)", () => {
    it("Markdown 취소선(del)과 DOCX 아래 첨자(sub)를 남긴다", () => {
      const html = "<p><del>3만 원</del> 2만 원, CO<sub>2</sub></p>";
      expect(sanitize(html)).toBe(html);
    });

    it("병합한 표 칸(colspan·rowspan)을 남긴다", () => {
      const html =
        '<table><tbody><tr><th colspan="3">머리칸</th></tr><tr><td rowspan="2">가</td><td>나</td><td>다</td></tr></tbody></table>';
      expect(sanitize(html)).toBe(html);
    });

    it("숫자가 아닌 colspan은 지운다", () => {
      expect(sanitize('<table><tbody><tr><td colspan="x">가</td></tr></tbody></table>')).toBe(
        "<table><tbody><tr><td>가</td></tr></tbody></table>",
      );
    });
  });

  describe("이미지 주소 (코드 리뷰 12-P2-1)", () => {
    const STORAGE = "https://project.supabase.co";
    const OURS = `${STORAGE}/storage/v1/object/public/chapter-images/b/c/a.png`;

    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", STORAGE);
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("우리 chapter-images 이미지는 남긴다", () => {
      const html = `<img src="${OURS}" alt="도표">`;
      expect(sanitize(html)).toBe(html);
    });

    it.each([
      ["외부 추적 픽셀", "https://tracker.example/p.gif"],
      ["data: URI", "data:image/png;base64,AAAA"],
      ["다른 버킷", `${STORAGE}/storage/v1/object/public/covers/covers/b/1.png`],
      ["다른 프로젝트", "https://evil.supabase.co/storage/v1/object/public/chapter-images/b/c/a.png"],
    ])("%s는 이미지를 빼고 대체 글을 남긴다", (_name, src) => {
      expect(sanitize(`<p><img src="${src}" alt="도표 1"></p>`)).toBe("<p>도표 1</p>");
    });

    it("대체 글이 없으면 이미지만 뺀다", () => {
      expect(sanitize('<p>가<img src="https://tracker.example/p.gif">나</p>')).toBe("<p>가나</p>");
    });
  });
});

describe("훅 범위", () => {
  it("다른 곳의 DOMPurify 호출에는 이 파일의 훅이 걸리지 않는다", async () => {
    const { default: DOMPurify } = await import("isomorphic-dompurify");
    sanitizeContent("<p>먼저 한 번 부른다</p>");
    const output = DOMPurify.sanitize('<input type="text"><p style="color: red">글</p>');
    expect(output).toContain("<input");
    expect(output).toContain('style="color: red"');
  });
});
