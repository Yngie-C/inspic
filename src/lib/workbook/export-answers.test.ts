// @vitest-environment node
import { describe, expect, it } from "vitest";
import { splitAnswers, type StoredResponseRow } from "./export-answers";

/**
 * 내보내기에 실을 응답을 나누는 단계.
 *
 * 노리는 실패는 하나입니다: **독자가 쓴 답이 조용히 사라지는 것.**
 * 저자가 문항을 지우면 정의가 없어져도 응답 행은 DB에 남습니다. 그 답이
 * 어디에도 나오지 않으면 독자는 자기가 쓴 것을 영영 못 봅니다.
 */

function section(attrs: Record<string, string>): string {
  const rendered = Object.entries(attrs)
    .map(([key, value]) => `${key}="${value.replace(/"/g, "&quot;")}"`)
    .join(" ");
  return `<section ${rendered}></section>`;
}

const REFLECTION = section({
  "data-template-type": "reflection",
  "data-node-id": "block-생각",
  "data-prompt": "무엇을 배웠나요?",
});

const CHAPTER = { id: "chapter-1", content_html: REFLECTION };

function response(over: Partial<StoredResponseRow>): StoredResponseRow {
  return {
    chapter_id: "chapter-1",
    block_id: "block-생각",
    field_key: "answer",
    value_text: null,
    value_number: null,
    value_bool: null,
    ...over,
  };
}

describe("splitAnswers", () => {
  it("본문에 남아 있는 문항의 답은 제자리로 보낸다", () => {
    const { answers, orphans } = splitAnswers(
      [CHAPTER],
      [response({ value_text: "먼저 묻는 법" })],
    );

    expect(answers).toEqual({ "block-생각": { answer: "먼저 묻는 법" } });
    expect(orphans).toEqual([]);
  });

  it("정의가 사라진 문항의 자유서술 답을 고아로 남긴다", () => {
    const { answers, orphans } = splitAnswers(
      [CHAPTER],
      [
        response({ field_key: "지워진-문항", value_text: "그래도 쓴 답" }),
      ],
    );

    expect(answers).toEqual({});
    expect(orphans).toEqual([
      { chapter_id: "chapter-1", text: "그래도 쓴 답" },
    ]);
  });

  /**
   * 문항 문구가 함께 지워지므로 `true`나 `7`만 남으면 읽을 수 없습니다.
   * 버리는 것이 아니라 보여 주지 않는 것입니다 — DB에는 그대로 있습니다.
   */
  it("정의가 사라진 체크·척도 답은 보여 주지 않는다", () => {
    const { orphans } = splitAnswers(
      [CHAPTER],
      [
        response({ block_id: "지워진-체크", field_key: "a", value_bool: true }),
        response({ block_id: "지워진-척도", field_key: "value", value_number: 7 }),
      ],
    );

    expect(orphans).toEqual([]);
  });

  it("빈 문자열 답은 고아로도 내지 않는다", () => {
    const { orphans } = splitAnswers(
      [CHAPTER],
      [response({ field_key: "지워진-문항", value_text: "   " })],
    );

    expect(orphans).toEqual([]);
  });

  it("고아 답을 원래 쓰던 챕터에 붙인다", () => {
    const { orphans } = splitAnswers(
      [CHAPTER, { id: "chapter-2", content_html: "<p>다른 장</p>" }],
      [
        response({
          chapter_id: "chapter-2",
          block_id: "지워진-블록",
          value_text: "2장에서 쓴 답",
        }),
      ],
    );

    expect(orphans).toEqual([
      { chapter_id: "chapter-2", text: "2장에서 쓴 답" },
    ]);
  });

  /**
   * 블록 ID가 같아도 문항 키가 다르면 다른 문항입니다. 체크리스트에서
   * 항목 하나만 지운 경우가 여기 걸립니다.
   */
  it("같은 블록 안에서 지워진 항목만 고아가 된다", () => {
    const checklist = section({
      "data-template-type": "checklist",
      "data-node-id": "block-체크",
      "data-items": JSON.stringify([{ id: "item-a", text: "남은 항목" }]),
    });

    const { answers, orphans } = splitAnswers(
      [{ id: "chapter-1", content_html: checklist }],
      [
        response({ block_id: "block-체크", field_key: "item-a", value_bool: true }),
        response({
          block_id: "block-체크",
          field_key: "item-지워짐",
          value_text: "메모였던 답",
        }),
      ],
    );

    expect(answers).toEqual({ "block-체크": { "item-a": true } });
    expect(orphans).toEqual([
      { chapter_id: "chapter-1", text: "메모였던 답" },
    ]);
  });

  it("본문이 비어 있으면 모든 자유서술 답이 고아가 된다", () => {
    const { answers, orphans } = splitAnswers(
      [{ id: "chapter-1", content_html: null }],
      [response({ value_text: "쓴 답" })],
    );

    expect(answers).toEqual({});
    expect(orphans).toHaveLength(1);
  });
});
