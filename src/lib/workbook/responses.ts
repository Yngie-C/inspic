import type {
  WorkbookAnswer,
  WorkbookBlock,
  WorkbookBlockField,
  WorkbookResponse,
} from "./types";

/**
 * 응답 하나를 가리키는 키.
 *
 * 응답의 정체성은 (block_id, field_key) 하나뿐입니다. 블록 안에서의
 * 순서나 개수는 정체성에 들어가지 않습니다 — 그래야 크리에이터가
 * 문항을 추가·삭제·이동해도 남은 응답이 제자리에 붙습니다.
 *
 * 구분자가 NUL 문자인 것은 의도적입니다. field_key는 크리에이터가
 * 만든 HTML에서 오므로 어떤 문자든 들어올 수 있는데, NUL만은 들어올 수
 * 없습니다. 흔한 구분자를 쓰면 ("a:b", "c")와 ("a", "b:c")가 같은 키가
 * 되어 서로 다른 문항의 응답이 뒤섞입니다.
 */
export function responseKey(blockId: string, fieldKey: string): string {
  return `${blockId}\u0000${fieldKey}`;
}

/** 세 값 컬럼 중 채워진 하나를 꺼냅니다. 셋 다 비어 있으면 미응답(null). */
export function answerFromResponse(response: WorkbookResponse): WorkbookAnswer {
  if (response.value_text !== null) return response.value_text;
  if (response.value_number !== null) return response.value_number;
  if (response.value_bool !== null) return response.value_bool;
  return null;
}

/** 응답 목록을 (block_id, field_key) → 값 맵으로 바꿉니다. */
export function buildAnswerMap(
  responses: readonly WorkbookResponse[],
): Map<string, WorkbookAnswer> {
  const map = new Map<string, WorkbookAnswer>();
  for (const response of responses) {
    map.set(
      responseKey(response.block_id, response.field_key),
      answerFromResponse(response),
    );
  }
  return map;
}

/**
 * 블록의 현재 문항 정의에 저장된 응답을 얹습니다.
 *
 * 반환 맵의 키는 언제나 "지금 블록에 있는 문항"입니다. 정의가 사라진
 * 문항의 응답은 여기 들어오지 않고 {@link orphanedResponses}로 갑니다.
 * 답이 없는 문항은 null입니다.
 */
export function restoreBlockAnswers(
  block: WorkbookBlock,
  responses: readonly WorkbookResponse[],
): Record<string, WorkbookAnswer> {
  const answers = buildAnswerMap(responses);
  const restored: Record<string, WorkbookAnswer> = {};

  for (const field of block.fields) {
    restored[field.field_key] =
      answers.get(responseKey(block.id, field.field_key)) ?? null;
  }

  return restored;
}

/** 챕터 단위로 복원합니다. block_id → (field_key → 값). */
export function restoreChapterAnswers(
  blocks: readonly WorkbookBlock[],
  responses: readonly WorkbookResponse[],
): Record<string, Record<string, WorkbookAnswer>> {
  const byBlock: Record<string, Record<string, WorkbookAnswer>> = {};
  for (const block of blocks) {
    byBlock[block.id] = restoreBlockAnswers(block, responses);
  }
  return byBlock;
}

/**
 * 블록에서 정의가 사라진 문항의 응답.
 *
 * 크리에이터가 문항을 지워도 독자가 쓴 내용은 DB에 남습니다. 화면에는
 * 뜨지 않지만 내보내기와 "내 워크북"에서는 살려 써야 하므로, 버리지 말고
 * 이 함수로 분리해 다루세요.
 */
export function orphanedResponses(
  block: WorkbookBlock,
  responses: readonly WorkbookResponse[],
): WorkbookResponse[] {
  const known = new Set(block.fields.map((field) => field.field_key));
  return responses.filter(
    (response) =>
      response.block_id === block.id && !known.has(response.field_key),
  );
}

/**
 * 문항 정의와 값으로 저장할 행을 만듭니다.
 *
 * 값 컬럼은 문항의 input_type이 결정합니다. 타입이 맞지 않으면 조용히
 * 변환하지 않고 던집니다 — 잘못된 컬럼에 들어간 응답은 나중에 집계에서
 * 사라지고, 그때는 원인을 찾을 수 없습니다.
 */
export function toResponseRow(
  blockId: string,
  field: WorkbookBlockField,
  answer: WorkbookAnswer,
): WorkbookResponse {
  const row: WorkbookResponse = {
    block_id: blockId,
    field_key: field.field_key,
    value_text: null,
    value_number: null,
    value_bool: null,
  };

  if (answer === null) return row;

  switch (field.input_type) {
    case "text":
    case "longtext":
      if (typeof answer !== "string") {
        throw new TypeError(
          `field "${field.field_key}" (${field.input_type}) expects a string, got ${typeof answer}`,
        );
      }
      row.value_text = answer;
      return row;

    case "integer":
      if (typeof answer !== "number" || !Number.isFinite(answer)) {
        throw new TypeError(
          `field "${field.field_key}" (integer) expects a finite number, got ${typeof answer}`,
        );
      }
      row.value_number = answer;
      return row;

    case "boolean":
      if (typeof answer !== "boolean") {
        throw new TypeError(
          `field "${field.field_key}" (boolean) expects a boolean, got ${typeof answer}`,
        );
      }
      row.value_bool = answer;
      return row;
  }
}

/** 블록 하나의 응답 전체를 저장 가능한 행 목록으로 바꿉니다. */
export function toResponseRows(
  block: WorkbookBlock,
  answers: Record<string, WorkbookAnswer>,
): WorkbookResponse[] {
  return block.fields
    .filter((field) => field.field_key in answers)
    .map((field) => toResponseRow(block.id, field, answers[field.field_key]));
}
