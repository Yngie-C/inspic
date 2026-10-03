import { describe, expect, it } from "vitest";
import {
  extractWorkbookBlocks,
  isChecklistItemsIntact,
  parseChecklistItems,
} from "./extract-blocks";

/**
 * 챕터 HTML에서 블록 정의를 뽑는 단계입니다. 여기서 ID를 새로 만들거나
 * 잃어버리면 그 뒤의 응답 매칭이 전부 어긋나므로, "ID를 있는 그대로
 * 가져오고 없으면 만들지 않는다"가 핵심입니다.
 */

function section(attrs: Record<string, string>): string {
  const rendered = Object.entries(attrs)
    .map(([key, value]) => `${key}="${value.replace(/"/g, "&quot;")}"`)
    .join(" ");
  return `<section ${rendered}></section>`;
}

describe("extractWorkbookBlocks", () => {
  it("HTML의 data-node-id를 블록 ID로 그대로 쓴다", () => {
    const blocks = extractWorkbookBlocks(
      section({
        "data-template-type": "reflection",
        "data-node-id": "고정-id",
        "data-prompt": "무엇을 배웠나요?",
      }),
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe("고정-id");
  });

  it("두 번 뽑아도 같은 결과가 나온다 — ID를 새로 만들지 않는다", () => {
    const html = section({
      "data-template-type": "scale",
      "data-node-id": "s-1",
      "data-min": "1",
      "data-max": "5",
    });

    expect(extractWorkbookBlocks(html)).toEqual(extractWorkbookBlocks(html));
  });

  it("data-node-id가 없는 블록은 건너뛴다", () => {
    const blocks = extractWorkbookBlocks(
      section({ "data-template-type": "reflection", "data-prompt": "질문" }),
    );

    expect(blocks).toEqual([]);
  });

  it("워크북 블록이 아닌 마크업은 무시한다", () => {
    const blocks = extractWorkbookBlocks(
      "<p>본문</p><section><h2>일반 섹션</h2></section>",
    );

    expect(blocks).toEqual([]);
  });

  it("등장 순서를 order_index로 남긴다", () => {
    const blocks = extractWorkbookBlocks(
      section({ "data-template-type": "callout", "data-node-id": "c-1" }) +
        "<p>사이 문단</p>" +
        section({ "data-template-type": "reflection", "data-node-id": "r-1" }),
    );

    expect(blocks.map((block) => [block.id, block.order_index])).toEqual([
      ["c-1", 0],
      ["r-1", 1],
    ]);
  });

  describe("블록 종류별 문항", () => {
    it("체크리스트는 항목 ID를 field_key로 삼는다", () => {
      const items = JSON.stringify([
        { id: "a", text: "물 마시기" },
        { id: "b", text: "산책하기" },
      ]);
      const [block] = extractWorkbookBlocks(
        section({
          "data-template-type": "checklist",
          "data-node-id": "cl-1",
          "data-items": items,
        }),
      );

      expect(block.block_type).toBe("checklist");
      expect(block.fields).toEqual([
        { field_key: "a", label: "물 마시기", input_type: "boolean", order_index: 0 },
        { field_key: "b", label: "산책하기", input_type: "boolean", order_index: 1 },
      ]);
    });

    it("리플렉션은 프롬프트를 라벨로 갖는 문항 하나다", () => {
      const [block] = extractWorkbookBlocks(
        section({
          "data-template-type": "reflection",
          "data-node-id": "r-1",
          "data-prompt": "무엇을 배웠나요?",
        }),
      );

      expect(block.fields).toEqual([
        {
          field_key: "answer",
          label: "무엇을 배웠나요?",
          input_type: "longtext",
          order_index: 0,
        },
      ]);
    });

    it("SMART 목표는 s~t 다섯 문항이 고정이다", () => {
      const [block] = extractWorkbookBlocks(
        section({ "data-template-type": "smart-goal", "data-node-id": "sg-1" }),
      );

      expect(block.block_type).toBe("smart_goal");
      expect(block.fields.map((field) => field.field_key)).toEqual([
        "s",
        "m",
        "a",
        "r",
        "t",
      ]);
    });

    it("스케일은 숫자 문항 하나와 범위 설정을 갖는다", () => {
      const [block] = extractWorkbookBlocks(
        section({
          "data-template-type": "scale",
          "data-node-id": "s-1",
          "data-min": "0",
          "data-max": "5",
          "data-label-min": "낮음",
          "data-label-max": "높음",
        }),
      );

      expect(block.config).toEqual({
        min: 0,
        max: 5,
        label_min: "낮음",
        label_max: "높음",
      });
      expect(block.fields).toEqual([
        {
          field_key: "value",
          label: "낮음 — 높음",
          input_type: "integer",
          order_index: 0,
        },
      ]);
    });

    it("콜아웃은 독자가 쓸 칸이 없다", () => {
      const [block] = extractWorkbookBlocks(
        section({
          "data-template-type": "callout",
          "data-node-id": "c-1",
          "data-callout-type": "tip",
          "data-content": "이렇게 해보세요",
        }),
      );

      expect(block.fields).toEqual([]);
      expect(block.config).toEqual({
        callout_type: "tip",
        content: "이렇게 해보세요",
      });
    });
  });
});

describe("parseChecklistItems", () => {
  it("id 없는 항목은 버린다 — 응답을 매달 키가 없다", () => {
    const items = parseChecklistItems(
      JSON.stringify([{ id: "a", text: "유효" }, { text: "id 없음" }]),
    );

    expect(items).toEqual([{ id: "a", text: "유효" }]);
  });

  it("망가진 JSON에서도 던지지 않는다", () => {
    expect(parseChecklistItems("{망가짐")).toEqual([]);
    expect(parseChecklistItems(undefined)).toEqual([]);
    expect(parseChecklistItems('{"id":"a"}')).toEqual([]);
  });

  it("겹친 id는 앞의 것만 그린다 — 두 항목이 답 하나를 나눠 갖지 않게", () => {
    // 하나를 누르면 둘 다 켜지고 "2개 중 2개"가 됐습니다(3-P1-13).
    const items = parseChecklistItems(
      JSON.stringify([
        { id: "a", text: "처음" },
        { id: "a", text: "복사본" },
        { id: "b", text: "다음" },
      ]),
    );
    expect(items).toEqual([
      { id: "a", text: "처음" },
      { id: "b", text: "다음" },
    ]);
  });

  it("문구가 문자열이 아니면 빈 문구로 둔다 — 리더가 렌더 중에 던지지 않게", () => {
    expect(
      parseChecklistItems(JSON.stringify([{ id: "a", text: { evil: 1 } }])),
    ).toEqual([{ id: "a", text: "" }]);
  });

  it("추출기는 겹친 id를 그대로 넘긴다 — 검수가 막을 수 있게", () => {
    const [block] = extractWorkbookBlocks(
      `<section data-template-type="checklist" data-node-id="11111111-1111-4111-8111-111111111111" data-items='${JSON.stringify(
        [
          { id: "a", text: "처음" },
          { id: "a", text: "복사본" },
        ],
      )}'></section>`,
    );
    expect(block.fields.map((field) => field.field_key)).toEqual(["a", "a"]);
  });
});

describe("isChecklistItemsIntact (4-P1-3)", () => {
  it("읽은 목록이 원문을 다 담으면 true", () => {
    expect(isChecklistItemsIntact(undefined)).toBe(true);
    expect(isChecklistItemsIntact("[]")).toBe(true);
    expect(isChecklistItemsIntact(JSON.stringify([{ id: "a", text: "운동" }, { id: "b" }]))).toBe(true);
  });

  it.each([
    ["깨진 JSON", "[{"],
    ["배열이 아님", JSON.stringify({ id: "a" })],
    ["id 없는 항목", JSON.stringify([{ text: "운동하기" }])],
    ["문자열 항목", JSON.stringify(["운동하기"])],
    ["문구가 객체", JSON.stringify([{ id: "a", text: { b: 1 } }])],
  ])("%s → false — 편집하면 읽지 못한 항목이 지워진다", (_label, raw) => {
    expect(isChecklistItemsIntact(raw)).toBe(false);
  });
});

