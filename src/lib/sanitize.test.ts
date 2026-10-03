import { describe, expect, it } from "vitest";
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

  describe("input 제한", () => {
    it("checkbox input은 남긴다", () => {
      expect(sanitize('<input type="checkbox">')).toContain("checkbox");
    });

    it("checkbox가 아닌 input은 지운다 — 자격증명 탈취 폼을 막는다", () => {
      expect(sanitize('<input type="password" name="pw">')).not.toContain("input");
      expect(sanitize('<input type="text" name="card">')).not.toContain("input");
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
