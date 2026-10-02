import { describe, expect, it } from "vitest";
import { extractWorkbookBlocks } from "./extract-blocks";
import {
  answerFromResponse,
  orphanedResponses,
  responseKey,
  restoreBlockAnswers,
  restoreChapterAnswers,
  summarizeProgress,
  toResponseRow,
  toResponseRows,
  isAnsweredValue,
} from "./responses";
import type { WorkbookBlock, WorkbookResponse } from "./types";

/**
 * 이 제품의 핵심 베팅은 독자가 쓴 내용입니다. 그래서 여기서 지키는 것은
 * 하나뿐입니다 — **크리에이터가 원고를 고쳐도 독자 응답은 살아남는다.**
 *
 * 실패하면 안 되는 방식은 배열 인덱스 매칭입니다. 문항을 하나만 넣거나
 * 빼도 그 뒤 응답이 통째로 밀리거나 사라지기 때문에, 아래 시나리오는
 * 전부 "정의를 바꾼 뒤 응답이 제자리에 붙어 있는가"를 봅니다.
 */

const BLOCK_ID = "block-1";

function checklistHtml(
  items: Array<{ id: string; text: string }>,
  blockId = BLOCK_ID,
): string {
  const encoded = JSON.stringify(items).replace(/"/g, "&quot;");
  return `<section data-template-type="checklist" data-node-id="${blockId}" data-items="${encoded}"></section>`;
}

function checked(fieldKey: string, blockId = BLOCK_ID): WorkbookResponse {
  return {
    block_id: blockId,
    field_key: fieldKey,
    value_text: null,
    value_number: null,
    value_bool: true,
  };
}

describe("responseKey", () => {
  it("구분자가 들어간 키끼리 충돌하지 않는다", () => {
    // field_key는 크리에이터가 만든 HTML에서 오므로 어떤 문자든 들어올 수
    // 있습니다. 흔한 구분자를 쓰면 아래 짝들이 같은 키가 되어 서로 다른
    // 문항의 응답이 뒤섞입니다. NUL은 어느 쪽에도 들어올 수 없습니다.
    for (const separator of [":", " ", "-", "|", "/"]) {
      expect(responseKey(`a${separator}b`, "c")).not.toBe(
        responseKey("a", `b${separator}c`),
      );
    }
  });

  it("같은 (block_id, field_key)는 항상 같은 키다", () => {
    expect(responseKey("block-1", "answer")).toBe(responseKey("block-1", "answer"));
  });
});

describe("answerFromResponse", () => {
  it("채워진 값 컬럼 하나를 꺼낸다", () => {
    expect(
      answerFromResponse({
        block_id: BLOCK_ID,
        field_key: "a",
        value_text: "적은 내용",
        value_number: null,
        value_bool: null,
      }),
    ).toBe("적은 내용");
  });

  it("false와 0을 미응답으로 뭉개지 않는다", () => {
    expect(
      answerFromResponse({
        block_id: BLOCK_ID,
        field_key: "a",
        value_text: null,
        value_number: null,
        value_bool: false,
      }),
    ).toBe(false);

    expect(
      answerFromResponse({
        block_id: BLOCK_ID,
        field_key: "a",
        value_text: null,
        value_number: 0,
        value_bool: null,
      }),
    ).toBe(0);
  });

  it("빈 문자열도 응답으로 본다", () => {
    expect(
      answerFromResponse({
        block_id: BLOCK_ID,
        field_key: "a",
        value_text: "",
        value_number: null,
        value_bool: null,
      }),
    ).toBe("");
  });

  it("셋 다 비면 미응답이다", () => {
    expect(
      answerFromResponse({
        block_id: BLOCK_ID,
        field_key: "a",
        value_text: null,
        value_number: null,
        value_bool: null,
      }),
    ).toBeNull();
  });
});

describe("크리에이터가 원고를 고쳐도 응답은 살아남는다", () => {
  const original = [
    { id: "a", text: "물 마시기" },
    { id: "b", text: "산책하기" },
    { id: "c", text: "일기 쓰기" },
  ];

  // 독자는 첫 항목과 마지막 항목을 체크했다.
  const responses = [checked("a"), checked("c")];

  function blockFrom(items: Array<{ id: string; text: string }>): WorkbookBlock {
    const [block] = extractWorkbookBlocks(checklistHtml(items));
    return block;
  }

  it("문항을 맨 앞에 추가해도 기존 응답이 밀리지 않는다", () => {
    const edited = [{ id: "z", text: "새 항목" }, ...original];

    expect(restoreBlockAnswers(blockFrom(edited), responses)).toEqual({
      z: null,
      a: true,
      b: null,
      c: true,
    });
  });

  it("문항을 중간에서 삭제해도 남은 응답이 그대로 붙는다", () => {
    const edited = original.filter((item) => item.id !== "b");

    expect(restoreBlockAnswers(blockFrom(edited), responses)).toEqual({
      a: true,
      c: true,
    });
  });

  it("순서를 뒤집어도 응답은 각자의 문항을 따라간다", () => {
    const edited = [...original].reverse();

    expect(restoreBlockAnswers(blockFrom(edited), responses)).toEqual({
      c: true,
      b: null,
      a: true,
    });
  });

  it("문항 텍스트를 고쳐도 그 문항의 응답은 유지된다", () => {
    const edited = original.map((item) =>
      item.id === "a" ? { ...item, text: "물 2L 마시기" } : item,
    );
    const block = blockFrom(edited);

    expect(block.fields[0].label).toBe("물 2L 마시기");
    expect(restoreBlockAnswers(block, responses).a).toBe(true);
  });

  it("추가·삭제·순서변경을 한꺼번에 해도 살아남는다", () => {
    const edited = [
      { id: "c", text: "일기 쓰기" },
      { id: "새-항목", text: "명상하기" },
      { id: "a", text: "물 마시기" },
    ];

    expect(restoreBlockAnswers(blockFrom(edited), responses)).toEqual({
      c: true,
      "새-항목": null,
      a: true,
    });
  });

  it("삭제된 문항의 응답은 화면에서 빠지되 버려지지는 않는다", () => {
    const edited = original.filter((item) => item.id !== "c");
    const block = blockFrom(edited);

    expect(restoreBlockAnswers(block, responses)).not.toHaveProperty("c");
    expect(orphanedResponses(block, responses)).toEqual([checked("c")]);
  });

  it("블록 ID가 바뀌면 응답이 끊긴다 — 그래서 ID는 재생성하지 않는다", () => {
    const [regenerated] = extractWorkbookBlocks(
      checklistHtml(original, "다른-블록-id"),
    );

    expect(restoreBlockAnswers(regenerated, responses)).toEqual({
      a: null,
      b: null,
      c: null,
    });
  });
});

describe("restoreBlockAnswers", () => {
  it("다른 블록의 응답을 끌어오지 않는다", () => {
    const [block] = extractWorkbookBlocks(
      checklistHtml([{ id: "a", text: "항목" }]),
    );

    expect(restoreBlockAnswers(block, [checked("a", "남의-블록")])).toEqual({
      a: null,
    });
  });
});

describe("restoreChapterAnswers", () => {
  it("챕터의 여러 블록을 각자의 응답과 맞춘다", () => {
    const blocks = extractWorkbookBlocks(
      checklistHtml([{ id: "a", text: "1번" }], "block-1") +
        `<section data-template-type="reflection" data-node-id="block-2" data-prompt="무엇을 배웠나요?"></section>`,
    );

    const responses: WorkbookResponse[] = [
      checked("a", "block-1"),
      {
        block_id: "block-2",
        field_key: "answer",
        value_text: "인덱스로 맞추면 안 된다는 것",
        value_number: null,
        value_bool: null,
      },
    ];

    expect(restoreChapterAnswers(blocks, responses)).toEqual({
      "block-1": { a: true },
      "block-2": { answer: "인덱스로 맞추면 안 된다는 것" },
    });
  });
});

describe("toResponseRow", () => {
  const field = {
    field_key: "value",
    label: "만족도",
    order_index: 0,
  };

  it("input_type에 맞는 값 컬럼에 넣는다", () => {
    expect(
      toResponseRow(BLOCK_ID, { ...field, input_type: "integer" }, 7),
    ).toEqual({
      block_id: BLOCK_ID,
      field_key: "value",
      value_text: null,
      value_number: 7,
      value_bool: null,
    });

    expect(
      toResponseRow(BLOCK_ID, { ...field, input_type: "longtext" }, "긴 답변"),
    ).toMatchObject({ value_text: "긴 답변", value_number: null });

    expect(
      toResponseRow(BLOCK_ID, { ...field, input_type: "boolean" }, false),
    ).toMatchObject({ value_bool: false, value_text: null });
  });

  it("미응답은 모든 값 컬럼을 비운다", () => {
    expect(
      toResponseRow(BLOCK_ID, { ...field, input_type: "integer" }, null),
    ).toMatchObject({ value_text: null, value_number: null, value_bool: null });
  });

  it("타입이 어긋나면 조용히 변환하지 않고 던진다", () => {
    expect(() =>
      toResponseRow(BLOCK_ID, { ...field, input_type: "integer" }, "7"),
    ).toThrow(TypeError);

    expect(() =>
      toResponseRow(BLOCK_ID, { ...field, input_type: "boolean" }, "true"),
    ).toThrow(TypeError);
  });
});

describe("toResponseRows", () => {
  it("현재 정의에 있는 문항만 저장 대상으로 삼는다", () => {
    const [block] = extractWorkbookBlocks(
      checklistHtml([
        { id: "a", text: "1번" },
        { id: "b", text: "2번" },
      ]),
    );

    const rows = toResponseRows(block, { a: true, "사라진-문항": true });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ field_key: "a", value_bool: true });
  });
});

describe("summarizeProgress", () => {
  const fields = [
    { block_id: "b-1", field_key: "answer" },
    { block_id: "b-1", field_key: "second" },
    { block_id: "b-2", field_key: "value" },
  ];

  function response(over: Partial<WorkbookResponse>): WorkbookResponse {
    return {
      block_id: "b-1",
      field_key: "answer",
      value_text: null,
      value_number: null,
      value_bool: null,
      ...over,
    };
  }

  it("답이 있는 문항만 센다", () => {
    expect(
      summarizeProgress(fields, [
        response({ value_text: "쓴 답" }),
        response({ field_key: "second" }),
      ]),
    ).toEqual({ total_fields: 3, answered_fields: 1 });
  });

  it("척도 0도 답으로 센다", () => {
    expect(
      summarizeProgress(fields, [
        response({ block_id: "b-2", field_key: "value", value_number: 0 }),
      ]),
    ).toMatchObject({ answered_fields: 1 });
  });

  /**
   * 체크 해제를 답으로 세면 체크리스트가 있는 책은 아무것도 하지 않아도
   * 진행률이 오릅니다. `workbook_response_stats()`도 같은 규칙입니다.
   */
  it("체크 해제(false)는 답으로 세지 않는다", () => {
    expect(
      summarizeProgress(fields, [response({ value_bool: false })]),
    ).toMatchObject({ answered_fields: 0 });

    expect(
      summarizeProgress(fields, [response({ value_bool: true })]),
    ).toMatchObject({ answered_fields: 1 });
  });

  /**
   * 정의가 사라진 문항의 응답은 분자에도 분모에도 들어가지 않습니다.
   * 세면 100%를 넘습니다.
   */
  it("정의가 사라진 문항의 답은 진행률을 넘기지 않는다", () => {
    expect(
      summarizeProgress(fields, [
        response({ value_text: "a" }),
        response({ field_key: "second", value_text: "b" }),
        response({ block_id: "b-2", field_key: "value", value_number: 5 }),
        response({ block_id: "지워진", field_key: "x", value_text: "고아" }),
      ]),
    ).toEqual({ total_fields: 3, answered_fields: 3 });
  });

  it("문항이 없으면 0으로 나누지 않고 0을 돌려준다", () => {
    expect(summarizeProgress([], [])).toEqual({
      total_fields: 0,
      answered_fields: 0,
    });
  });
});

describe("isAnsweredValue", () => {
  it("공백뿐인 글·체크 해제·null은 답이 아니다", () => {
    // 서버도 같은 판정으로 공백 답을 NULL로 저장합니다. 둘이 어긋나면 독자의
    // 진행률과 저자가 보는 참여율이 달라집니다(3-P1-2, 3-P1-15).
    expect(isAnsweredValue(" \n\t")).toBe(false);
    expect(isAnsweredValue("")).toBe(false);
    expect(isAnsweredValue(false)).toBe(false);
    expect(isAnsweredValue(null)).toBe(false);
  });

  it("글자·숫자(0 포함)·체크는 답이다", () => {
    expect(isAnsweredValue(" 답 ")).toBe(true);
    expect(isAnsweredValue(0)).toBe(true);
    expect(isAnsweredValue(true)).toBe(true);
  });
});

