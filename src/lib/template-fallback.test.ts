import { describe, expect, it } from "vitest";
import { applyTemplateFallback } from "./template-fallback";

/**
 * 내보내기용 정적 HTML 변환.
 *
 * M5 이전에는 늘 빈 워크시트가 나왔습니다. 이제 독자가 쓴 답을 받아
 * 제자리에 채웁니다. 답은 챕터 HTML이 아니라 `workbook_responses`에서
 * 오므로 (block_id, field_key)로만 만납니다 — 여기서 순서나 인덱스로
 * 붙이면 저자가 문항을 고친 순간 남의 답이 남의 자리에 들어갑니다.
 */

function section(attrs: Record<string, string>): string {
  const rendered = Object.entries(attrs)
    .map(([key, value]) => `${key}="${value.replace(/"/g, "&quot;")}"`)
    .join(" ");
  return `<section ${rendered}></section>`;
}

const CHECKLIST = section({
  "data-template-type": "checklist",
  "data-node-id": "block-체크",
  "data-items": JSON.stringify([
    { id: "item-a", text: "첫 번째 할 일" },
    { id: "item-b", text: "두 번째 할 일" },
  ]),
});

const REFLECTION = section({
  "data-template-type": "reflection",
  "data-node-id": "block-생각",
  "data-prompt": "이번 주에 무엇을 배웠나요?",
});

const SCALE = section({
  "data-template-type": "scale",
  "data-node-id": "block-척도",
  "data-min": "1",
  "data-max": "10",
  "data-label-min": "전혀 아니다",
  "data-label-max": "매우 그렇다",
});

const SMART_GOAL = section({
  "data-template-type": "smart-goal",
  "data-node-id": "block-목표",
});

describe("답이 없을 때", () => {
  it("체크리스트를 빈 칸으로 낸다", () => {
    const html = applyTemplateFallback(CHECKLIST);

    expect(html).toContain("□ 첫 번째 할 일");
    expect(html).toContain("□ 두 번째 할 일");
    expect(html).not.toContain("✓");
  });

  it("리플렉션은 질문과 빈 줄만 남긴다", () => {
    const html = applyTemplateFallback(REFLECTION);

    expect(html).toContain("<strong>이번 주에 무엇을 배웠나요?</strong>");
    expect(html).toContain('<p class="answer-blank">&#160;</p>');
  });

  it("척도는 눈금만 낸다", () => {
    expect(applyTemplateFallback(SCALE)).toBe(
      "<p>척도: [전혀 아니다] 1-10 [매우 그렇다]</p>",
    );
  });
});

describe("답이 있을 때", () => {
  it("체크한 항목만 체크 표시를 단다", () => {
    const html = applyTemplateFallback(CHECKLIST, {
      answers: { "block-체크": { "item-a": true, "item-b": false } },
    });

    expect(html).toContain("✓ 첫 번째 할 일");
    expect(html).toContain("□ 두 번째 할 일");
  });

  it("리플렉션 답을 질문 아래에 넣는다", () => {
    const html = applyTemplateFallback(REFLECTION, {
      answers: { "block-생각": { answer: "팀에게 먼저 묻는 법을 배웠습니다." } },
    });

    expect(html).toContain("<p>팀에게 먼저 묻는 법을 배웠습니다.</p>");
    expect(html).not.toContain("&nbsp;");
  });

  /**
   * 줄바꿈을 `<br>`로 두면 `stripHtmlForPdf()`가 공백을 접으면서 여러 줄로
   * 쓴 답이 PDF에서 한 줄로 이어 붙습니다.
   */
  it("여러 줄로 쓴 답을 문단으로 나눈다", () => {
    const html = applyTemplateFallback(REFLECTION, {
      answers: { "block-생각": { answer: "첫째 줄\n둘째 줄" } },
    });

    expect(html).toContain("<p>첫째 줄</p>");
    expect(html).toContain("<p>둘째 줄</p>");
  });

  it("척도 값을 눈금 옆에 붙인다", () => {
    const html = applyTemplateFallback(SCALE, {
      answers: { "block-척도": { value: 7 } },
    });

    expect(html).toContain("<strong>7</strong>");
  });

  it("SMART 목표 다섯 칸을 각각 채운다", () => {
    const html = applyTemplateFallback(SMART_GOAL, {
      answers: {
        "block-목표": {
          s: "매일 30분 글쓰기",
          m: "주 5회 기록",
          a: "가능하다",
          r: "책 출간과 연결된다",
          t: "3개월 안에",
        },
      },
    });

    for (const answer of ["매일 30분 글쓰기", "주 5회 기록", "3개월 안에"]) {
      expect(html).toContain(`<td>${answer}</td>`);
    }
  });

  it("답을 쓰지 않은 SMART 항목은 빈 칸으로 남긴다", () => {
    const html = applyTemplateFallback(SMART_GOAL, {
      answers: { "block-목표": { s: "매일 30분 글쓰기" } },
    });

    expect(html).toContain("<td>매일 30분 글쓰기</td>");
    expect(html).toContain("<td>&#160;</td>");
  });
});

describe("답을 엉뚱한 자리에 붙이지 않는다", () => {
  it("다른 블록의 답을 가져다 쓰지 않는다", () => {
    const html = applyTemplateFallback(CHECKLIST, {
      answers: { "다른-블록": { "item-a": true } },
    });

    expect(html).toContain("□ 첫 번째 할 일");
    expect(html).not.toContain("✓");
  });

  /**
   * 저자가 항목을 지웠다 되살려도 field_key가 같으면 답이 제자리로
   * 돌아옵니다. 순서가 바뀌어도 마찬가지여야 합니다.
   */
  it("항목 순서가 바뀌어도 field_key로 따라간다", () => {
    const reordered = section({
      "data-template-type": "checklist",
      "data-node-id": "block-체크",
      "data-items": JSON.stringify([
        { id: "item-b", text: "두 번째 할 일" },
        { id: "item-a", text: "첫 번째 할 일" },
      ]),
    });

    const html = applyTemplateFallback(reordered, {
      answers: { "block-체크": { "item-a": true, "item-b": false } },
    });

    expect(html).toContain("✓ 첫 번째 할 일");
    expect(html).toContain("□ 두 번째 할 일");
  });

  it("타입이 어긋난 값은 무시한다", () => {
    const html = applyTemplateFallback(SCALE, {
      answers: { "block-척도": { value: "일곱" } },
    });

    expect(html).not.toContain("일곱");
  });
});

describe("이모지", () => {
  const CALLOUT = section({
    "data-template-type": "callout",
    "data-node-id": "block-안내",
    "data-callout-type": "tip",
    "data-content": "먼저 목표부터 적어 보세요.",
  });

  it("EPUB은 이모지를 그대로 쓴다", () => {
    expect(applyTemplateFallback(CALLOUT)).toContain("💡");
  });

  /**
   * PDF에 번들한 한글 폰트(Noto Sans KR)에는 이모지 글리프가 없습니다.
   * 그대로 두면 앞머리가 네모나 엉뚱한 글자로 찍힙니다.
   */
  it("PDF는 이모지 대신 텍스트 라벨을 쓴다", () => {
    const html = applyTemplateFallback(CALLOUT, { emoji: false });

    expect(html).toContain("[팁]");
    expect(html).not.toContain("💡");
  });
});

describe("답에 든 HTML", () => {
  it("독자가 쓴 태그를 이스케이프한다", () => {
    const html = applyTemplateFallback(REFLECTION, {
      answers: {
        "block-생각": { answer: "<script>alert(1)</script> 라고 썼습니다" },
      },
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("XHTML에 그대로 들어간다", () => {
  /**
   * EPUB 장 파일은 DTD 없는 XHTML이라 `&nbsp;` 같은 이름 엔티티가 정의되지
   * 않은 엔티티(XML 오류)입니다. 답을 넘기지 않는 EPUB에서는 성찰·SMART
   * 블록이 늘 빈 칸을 내므로, 여기서 이름 엔티티를 내면 그 장이 열리지 않습니다.
   */
  it("빈 칸에 이름 엔티티를 쓰지 않는다", () => {
    const html = applyTemplateFallback(`${REFLECTION}${SMART_GOAL}`);

    expect(html).not.toMatch(/&(?!(?:amp|lt|gt|quot|apos|#\d+);)/);
  });

  it("문구의 &nbsp;를 글자로 풀고 엔티티 글자로 다시 감싸지 않는다", () => {
    const html = applyTemplateFallback(
      section({
        "data-template-type": "callout",
        "data-node-id": "block-안내",
        "data-callout-type": "tip",
        "data-content": "먼저&nbsp;읽기",
      }),
    );

    expect(html).toContain("먼저\u00a0읽기");
    expect(html).not.toContain("&amp;nbsp;");
  });

  it("&amp;lt;는 한 번만 푼다", () => {
    const html = applyTemplateFallback(
      section({
        "data-template-type": "reflection",
        "data-node-id": "block-생각",
        "data-prompt": "&amp;lt;b&amp;gt;는 태그예요",
      }),
    );

    expect(html).toContain("&amp;lt;b&amp;gt;는 태그예요");
  });
});

describe("속성값에 든 >", () => {
  /**
   * sanitize는 속성값 안의 `>`를 이스케이프하지 않고, 에디터는
   * `data-template-type`을 맨 뒤에 붙입니다. 여는 태그를 `[^>]*`로 훑으면
   * 질문에 `>` 하나만 있어도 블록이 변환되지 않아 문항과 답이 빠졌습니다.
   */
  it("질문에 >가 있어도 블록을 변환한다", () => {
    const html = applyTemplateFallback(
      '<section data-node-id="block-생각" data-prompt="A > B 일까요?" data-template-type="reflection"></section>',
      { answers: { "block-생각": { answer: "그렇다" } } },
    );

    expect(html).not.toContain("<section");
    expect(html).toContain("<strong>A &gt; B 일까요?</strong>");
    expect(html).toContain("<p>그렇다</p>");
  });

  it("체크리스트 항목에 >가 있어도 블록을 변환한다", () => {
    const items = JSON.stringify([{ id: "item-a", text: "1 > 0 확인" }]).replace(/"/g, "&quot;");
    const html = applyTemplateFallback(
      `<section data-node-id="block-체크" data-items="${items}" data-template-type="checklist"></section>`,
      { answers: { "block-체크": { "item-a": true } } },
    );

    expect(html).toBe("<ul>\n<li>✓ 1 &gt; 0 확인</li>\n</ul>");
  });
});
