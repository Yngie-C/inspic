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
