import { describe, expect, it } from "vitest";
import {
  buildEngagement,
  type BlockDefinition,
  type ChapterDefinition,
  type ResponseStatRow,
} from "./engagement";

/**
 * 크리에이터가 "어디서 독자가 그만두는지" 보는 화면의 재료.
 *
 * 가장 위험한 실수는 **아무도 답하지 않은 블록이 목록에서 사라지는
 * 것**입니다. 집계에서 출발하면 그렇게 되는데, 그 블록이야말로 저자가
 * 찾는 이탈 지점입니다.
 */

const CHAPTERS: ChapterDefinition[] = [
  { id: "ch-2", title: "2장", order_index: 1 },
  { id: "ch-1", title: "1장", order_index: 0 },
];

function block(over: Partial<BlockDefinition> & { id: string }): BlockDefinition {
  return {
    chapter_id: "ch-1",
    block_type: "reflection",
    order_index: 0,
    fields: [{ field_key: "answer", label: "무엇을 배웠나요?", order_index: 0 }],
    ...over,
  };
}

function stat(
  block_id: string,
  field_key: string,
  answered_count: number,
): ResponseStatRow {
  return { block_id, field_key, answered_count, respondent_count: answered_count };
}

describe("buildEngagement", () => {
  it("챕터와 블록을 책 순서대로 늘어놓는다", () => {
    const result = buildEngagement(
      CHAPTERS,
      [
        block({ id: "b-2", chapter_id: "ch-1", order_index: 1 }),
        block({ id: "b-1", chapter_id: "ch-1", order_index: 0 }),
        block({ id: "b-3", chapter_id: "ch-2", order_index: 0 }),
      ],
      [stat("b-1", "answer", 3), stat("b-2", "answer", 2), stat("b-3", "answer", 1)],
    );

    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["1장", "2장"]);
    expect(result.chapters[0].blocks.map((b) => b.block_id)).toEqual(["b-1", "b-2"]);
  });

  /**
   * 이탈 지점은 정확히 "답이 0인 블록"입니다. 집계에 행이 없다고
   * 목록에서 빼면 화면에 아무 문제도 없어 보입니다.
   */
  it("아무도 답하지 않은 블록도 0으로 남긴다", () => {
    const result = buildEngagement(
      CHAPTERS,
      [
        block({ id: "b-1", order_index: 0 }),
        block({ id: "b-끝", order_index: 1 }),
      ],
      [stat("b-1", "answer", 5)],
    );

    expect(result.chapters[0].blocks.map((b) => b.answered_readers)).toEqual([5, 0]);
  });

  it("가장 많이 답한 블록의 수를 참여 독자 수로 삼는다", () => {
    const result = buildEngagement(
      CHAPTERS,
      [block({ id: "b-1", order_index: 0 }), block({ id: "b-2", order_index: 1 })],
      [stat("b-1", "answer", 7), stat("b-2", "answer", 3)],
    );

    expect(result.engaged_readers).toBe(7);
  });

  /**
   * 체크리스트는 항목마다 답이 갈립니다. 항목 하나만 체크한 사람도
   * 그 블록에는 닿은 것이므로, 블록 참여는 최댓값으로 봅니다.
   */
  it("문항이 여럿인 블록은 가장 많이 답한 문항으로 센다", () => {
    const result = buildEngagement(
      CHAPTERS,
      [
        block({
          id: "b-체크",
          block_type: "checklist",
          fields: [
            { field_key: "item-a", label: "첫째", order_index: 0 },
            { field_key: "item-b", label: "둘째", order_index: 1 },
          ],
        }),
      ],
      [stat("b-체크", "item-a", 4), stat("b-체크", "item-b", 1)],
    );

    expect(result.chapters[0].blocks[0].answered_readers).toBe(4);
  });

  /**
   * 콜아웃은 독자가 채울 칸이 없어 언제나 0입니다. 이탈을 보는
   * 화면에서 0은 "여기서 다 그만뒀다"로 읽히므로 넣지 않습니다.
   */
  it("문항이 없는 블록은 목록에서 뺀다", () => {
    const result = buildEngagement(
      CHAPTERS,
      [
        block({ id: "b-1", order_index: 0 }),
        block({ id: "b-콜아웃", block_type: "callout", order_index: 1, fields: [] }),
      ],
      [stat("b-1", "answer", 2)],
    );

    expect(result.chapters[0].blocks.map((b) => b.block_id)).toEqual(["b-1"]);
  });

  it("워크북 블록이 없는 챕터는 내보내지 않는다", () => {
    const result = buildEngagement(
      CHAPTERS,
      [block({ id: "b-1", chapter_id: "ch-1" })],
      [],
    );

    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["1장"]);
  });

  it("응답이 하나도 없으면 참여 독자가 0이다", () => {
    const result = buildEngagement(CHAPTERS, [block({ id: "b-1" })], []);

    expect(result.engaged_readers).toBe(0);
    expect(result.chapters[0].blocks[0].answered_readers).toBe(0);
  });

  it("문항 라벨을 그대로 실어 보낸다", () => {
    const result = buildEngagement(
      CHAPTERS,
      [block({ id: "b-1" })],
      [stat("b-1", "answer", 1)],
    );

    expect(result.chapters[0].blocks[0].fields).toEqual([
      { field_key: "answer", label: "무엇을 배웠나요?", answered_count: 1 },
    ]);
  });

  it("같은 문항이 장별로 나뉘어 와도 응답 수를 더한다", () => {
    // 블록을 옮겼거나 장을 지운 답은 chapter_id가 달라 집계 행이 둘로
    // 옵니다. 덮어쓰면 한쪽 장의 응답 수가 사라졌습니다(3-P1-17).
    const result = buildEngagement(
      CHAPTERS,
      [block({ id: "b-1" })],
      [stat("b-1", "answer", 2), stat("b-1", "answer", 3)],
    );

    expect(result.chapters[0].blocks[0].fields[0].answered_count).toBe(5);
  });
});
