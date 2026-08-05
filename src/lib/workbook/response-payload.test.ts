import { describe, expect, it } from "vitest";
import {
  buildResponseRows,
  parseResponseWrites,
  writeBlockIds,
  MAX_RESPONSE_WRITES,
  MAX_TEXT_LENGTH,
  type StoredFieldDefinition,
} from "./response-payload";

/**
 * 리더가 보낸 응답을 저장 행으로 바꾸는 층.
 *
 * 이 층이 지키는 것은 둘입니다.
 * - 챕터와 값 컬럼은 **DB의 블록 정의**가 정한다 (클라이언트가 아니라)
 * - 한 건이 잘못돼도 나머지는 저장된다 (독자가 함께 쓴 답이 날아가지 않게)
 */

const BLOCK = "11111111-1111-4111-8111-111111111111";
const OTHER_BLOCK = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const BOOK = "44444444-4444-4444-8444-444444444444";
const CHAPTER = "55555555-5555-4555-8555-555555555555";

function definition(
  overrides: Partial<StoredFieldDefinition> = {},
): StoredFieldDefinition {
  return {
    block_id: BLOCK,
    field_key: "answer",
    input_type: "longtext",
    chapter_id: CHAPTER,
    book_id: BOOK,
    ...overrides,
  };
}

describe("parseResponseWrites", () => {
  it("정상 payload를 통과시킨다", () => {
    const parsed = parseResponseWrites({
      answers: [{ block_id: BLOCK, field_key: "answer", value: "다 썼어요" }],
    });

    expect(parsed).toEqual({
      ok: true,
      writes: [{ block_id: BLOCK, field_key: "answer", value: "다 썼어요" }],
    });
  });

  it("UUID가 아닌 block_id를 막는다", () => {
    // 저장해도 workbook_responses.block_id(uuid)에 들어가지 못합니다.
    const parsed = parseResponseWrites({
      answers: [{ block_id: "block-1", field_key: "answer", value: "x" }],
    });

    expect(parsed.ok).toBe(false);
  });

  it("빈 문자열은 미응답(null)으로 본다", () => {
    // 그대로 저장하면 크리에이터가 보는 참여율이 부풀려집니다.
    const parsed = parseResponseWrites({
      answers: [{ block_id: BLOCK, field_key: "answer", value: "" }],
    });

    expect(parsed).toMatchObject({ ok: true, writes: [{ value: null }] });
  });

  it("false는 값으로 남긴다", () => {
    // 체크 해제는 "안 함"이라는 답이지 미응답이 아닙니다.
    const parsed = parseResponseWrites({
      answers: [{ block_id: BLOCK, field_key: "a", value: false }],
    });

    expect(parsed).toMatchObject({ ok: true, writes: [{ value: false }] });
  });

  it("길이 제약을 DB보다 먼저 잡는다", () => {
    // DB CHECK에 걸리면 배치 전체가 실패해 함께 쓴 답까지 날아갑니다.
    const parsed = parseResponseWrites({
      answers: [
        { block_id: BLOCK, field_key: "answer", value: "가".repeat(MAX_TEXT_LENGTH + 1) },
      ],
    });

    expect(parsed.ok).toBe(false);
  });

  it("배치 안에 같은 문항이 두 번 오면 마지막 값만 남긴다", () => {
    // upsert에 중복 키가 들어가면 "cannot affect row a second time"으로
    // 배치 전체가 실패합니다.
    const parsed = parseResponseWrites({
      answers: [
        { block_id: BLOCK, field_key: "answer", value: "처음" },
        { block_id: BLOCK, field_key: "answer", value: "고침" },
      ],
    });

    expect(parsed).toEqual({
      ok: true,
      writes: [{ block_id: BLOCK, field_key: "answer", value: "고침" }],
    });
  });

  it("배열이 아니거나 너무 크면 막는다", () => {
    expect(parseResponseWrites({ answers: "nope" }).ok).toBe(false);
    expect(parseResponseWrites(null).ok).toBe(false);
    expect(
      parseResponseWrites({
        answers: Array.from({ length: MAX_RESPONSE_WRITES + 1 }, () => ({
          block_id: BLOCK,
          field_key: "answer",
          value: "x",
        })),
      }).ok,
    ).toBe(false);
  });

  it("객체·배열 같은 값은 막는다", () => {
    expect(
      parseResponseWrites({
        answers: [{ block_id: BLOCK, field_key: "a", value: { nested: 1 } }],
      }).ok,
    ).toBe(false);
    expect(
      parseResponseWrites({
        answers: [{ block_id: BLOCK, field_key: "a", value: Number.NaN }],
      }).ok,
    ).toBe(false);
  });
});

describe("buildResponseRows", () => {
  it("챕터와 책을 정의에서 가져온다", () => {
    // 클라이언트는 chapter_id를 보내지 않습니다. 보낼 수 있게 두면
    // 응답을 엉뚱한 챕터에 붙일 수 있습니다.
    const { rows } = buildResponseRows(
      USER,
      [{ block_id: BLOCK, field_key: "answer", value: "답" }],
      [definition()],
    );

    expect(rows).toEqual([
      {
        user_id: USER,
        book_id: BOOK,
        chapter_id: CHAPTER,
        block_id: BLOCK,
        field_key: "answer",
        value_text: "답",
        value_number: null,
        value_bool: null,
      },
    ]);
  });

  it("문항 타입이 값 컬럼을 정한다", () => {
    const { rows } = buildResponseRows(
      USER,
      [
        { block_id: BLOCK, field_key: "done", value: true },
        { block_id: BLOCK, field_key: "score", value: 7 },
      ],
      [
        definition({ field_key: "done", input_type: "boolean" }),
        definition({ field_key: "score", input_type: "integer" }),
      ],
    );

    expect(rows[0]).toMatchObject({ value_bool: true, value_number: null });
    expect(rows[1]).toMatchObject({ value_number: 7, value_bool: null });
  });

  it("미응답은 세 값 컬럼이 모두 비어 있다", () => {
    const { rows } = buildResponseRows(
      USER,
      [{ block_id: BLOCK, field_key: "answer", value: null }],
      [definition()],
    );

    expect(rows[0]).toMatchObject({
      value_text: null,
      value_number: null,
      value_bool: null,
    });
  });

  it("정의가 DB에 없는 문항은 저장하지 않고 알린다", () => {
    // 크리에이터가 아직 저장하지 않은 블록입니다. 조용히 버리면 독자는
    // 저장된 줄 알고 계속 씁니다.
    const { rows, rejected } = buildResponseRows(
      USER,
      [{ block_id: OTHER_BLOCK, field_key: "answer", value: "답" }],
      [definition()],
    );

    expect(rows).toHaveLength(0);
    expect(rejected).toEqual([
      { block_id: OTHER_BLOCK, field_key: "answer", reason: "unknown_field" },
    ]);
  });

  it("타입이 어긋난 한 건 때문에 나머지를 버리지 않는다", () => {
    const { rows, rejected } = buildResponseRows(
      USER,
      [
        { block_id: BLOCK, field_key: "score", value: "일곱" },
        { block_id: BLOCK, field_key: "answer", value: "멀쩡한 답" },
      ],
      [
        definition({ field_key: "score", input_type: "integer" }),
        definition({ field_key: "answer" }),
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].value_text).toBe("멀쩡한 답");
    expect(rejected).toEqual([
      {
        block_id: BLOCK,
        field_key: "score",
        reason: "type_mismatch",
        expected: "integer",
      },
    ]);
  });

  it("같은 field_key라도 블록이 다르면 섞이지 않는다", () => {
    const { rows } = buildResponseRows(
      USER,
      [
        { block_id: BLOCK, field_key: "answer", value: "이쪽" },
        { block_id: OTHER_BLOCK, field_key: "answer", value: "저쪽" },
      ],
      [
        definition(),
        definition({ block_id: OTHER_BLOCK, chapter_id: "other-chapter" }),
      ],
    );

    expect(rows[0]).toMatchObject({ block_id: BLOCK, chapter_id: CHAPTER });
    expect(rows[1]).toMatchObject({
      block_id: OTHER_BLOCK,
      chapter_id: "other-chapter",
    });
  });
});

describe("writeBlockIds", () => {
  it("중복 없이 블록 ID만 모은다", () => {
    expect(
      writeBlockIds([
        { block_id: BLOCK, field_key: "a", value: true },
        { block_id: BLOCK, field_key: "b", value: true },
        { block_id: OTHER_BLOCK, field_key: "a", value: true },
      ]),
    ).toEqual([BLOCK, OTHER_BLOCK]);
  });
});
