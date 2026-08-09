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

/**
 * 정의 없이 응답만으로 block_id → (field_key → 값)을 만듭니다.
 *
 * {@link restoreChapterAnswers}와 나뉜 이유는 리더가 블록 정의를 들고 있지
 * 않기 때문입니다. 리더는 챕터 HTML을 파싱해 문항을 그리므로, 화면에 무엇이
 * 있는지는 이미 HTML이 정하고 여기서는 값만 얹으면 됩니다. 정의 기준으로
 * 걸러야 하는 곳(내보내기, 집계)은 {@link restoreChapterAnswers}를 쓰세요.
 *
 * 정의가 사라진 문항의 응답도 그대로 들어 있습니다. HTML에 그 문항이 없으면
 * 화면에 뜨지 않을 뿐이고, 값은 DB에 남습니다.
 */
export function groupAnswersByBlock(
  responses: readonly WorkbookResponse[],
): Record<string, Record<string, WorkbookAnswer>> {
  const byBlock: Record<string, Record<string, WorkbookAnswer>> = {};

  for (const response of responses) {
    const block = (byBlock[response.block_id] ??= {});
    block[response.field_key] = answerFromResponse(response);
  }

  return byBlock;
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
 * 이 응답을 "답했다"로 셀 것인가.
 *
 * 체크 해제(`false`)는 답하지 않은 것으로 봅니다. 값으로 저장은 하지만
 * (M3에서 정했습니다) 참여율에 세지는 않습니다 — 체크박스를 지나친
 * 사람과 일부러 끈 사람을 진행률에서 구분할 방법이 없고, 끈 것을 답으로
 * 세면 체크리스트가 있는 책은 아무것도 안 해도 진행률이 오릅니다.
 *
 * **이 판정은 `workbook_response_stats()`의 `answered_count`와 같아야
 * 합니다.** 어긋나면 독자가 보는 진행률과 저자가 보는 참여율이 달라지고,
 * 둘 중 어느 쪽이 맞는지 아무도 모르게 됩니다.
 */
export function isAnswered(response: WorkbookResponse): boolean {
  return (
    response.value_text !== null ||
    response.value_number !== null ||
    response.value_bool === true
  );
}

/** 독자 한 명이 책 한 권에서 얼마나 채웠는지. */
export interface WorkbookProgress {
  total_fields: number;
  answered_fields: number;
}

/**
 * 진행률을 셉니다.
 *
 * 분모는 지금 책에 있는 문항이고, 분자는 그중 답이 있는 것입니다.
 * 정의가 사라진 문항의 응답은 양쪽 어디에도 들어가지 않습니다 —
 * 세면 100%를 넘고, 분모에만 넣으면 채울 수 없는 칸이 영영 남습니다.
 */
export function summarizeProgress(
  fields: readonly { block_id: string; field_key: string }[],
  responses: readonly WorkbookResponse[],
): WorkbookProgress {
  const answered = new Set(
    responses
      .filter(isAnswered)
      .map((response) => responseKey(response.block_id, response.field_key)),
  );

  let answeredFields = 0;
  for (const field of fields) {
    if (answered.has(responseKey(field.block_id, field.field_key))) {
      answeredFields += 1;
    }
  }

  return { total_fields: fields.length, answered_fields: answeredFields };
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
 *
 * 정의는 키와 타입만 봅니다. 라벨·순서는 값이 어디로 갈지에 관여하지
 * 않으므로, DB에서 필요한 두 컬럼만 읽어 온 정의도 그대로 넘길 수 있습니다.
 */
export function toResponseRow(
  blockId: string,
  field: Pick<WorkbookBlockField, "field_key" | "input_type">,
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
