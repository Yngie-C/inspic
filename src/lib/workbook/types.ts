// ============================================================
// 워크북 도메인 타입
//
// 블록 정의(크리에이터가 만든 문항)와 독자 응답은 별개의 데이터입니다.
// 둘을 잇는 키는 (block_id, field_key)뿐이며, 배열 인덱스나 길이로
// 매칭하지 않습니다. 크리에이터가 문항을 추가·삭제·이동해도 남은
// 문항의 응답은 그대로 붙어 있어야 합니다.
// ============================================================

/** `workbook_blocks.block_type` */
export type WorkbookBlockType =
  | "checklist"
  | "callout"
  | "reflection"
  | "smart_goal"
  | "scale";

/** `workbook_block_fields.input_type` — 응답이 어느 값 컬럼에 저장되는지 결정합니다. */
export type WorkbookFieldType = "text" | "longtext" | "boolean" | "integer";

/** 독자가 한 문항에 남긴 값. null은 "아직 답하지 않음"입니다. */
export type WorkbookAnswer = string | number | boolean | null;

/** 블록 안의 문항 하나. `workbook_block_fields` 한 행에 대응합니다. */
export interface WorkbookBlockField {
  field_key: string;
  label: string;
  input_type: WorkbookFieldType;
  order_index: number;
}

/** 블록 정의 하나. `workbook_blocks` 한 행 + 소속 문항들. */
export interface WorkbookBlock {
  /** `data-node-id`이자 `workbook_blocks.id`. 생성 시 1회 부여 후 불변. */
  id: string;
  block_type: WorkbookBlockType;
  order_index: number;
  /** 문항이 아닌 표현 설정만 담습니다 (scale의 min/max, callout의 종류 등). */
  config: Record<string, string | number | boolean>;
  fields: WorkbookBlockField[];
}

/** 저장된 응답 한 건. `workbook_responses` 한 행. */
export interface WorkbookResponse {
  block_id: string;
  field_key: string;
  value_text: string | null;
  value_number: number | null;
  value_bool: boolean | null;
}

/**
 * 체크리스트 항목. `id`가 그 항목의 `field_key`입니다.
 *
 * 체크 여부는 여기 없습니다. 그건 독자의 응답이고, 응답은 블록 정의가
 * 아니라 `workbook_responses`에 삽니다. 불변식 하나로 정리하면:
 * **`data-*` 속성에는 독자 응답을 담지 않는다.**
 */
export interface ChecklistItem {
  id: string;
  text: string;
}

/** SMART 목표의 문항 키와 라벨. 키는 고정이므로 항목 추가·삭제가 없습니다. */
export const SMART_GOAL_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "s", label: "Specific — 구체적으로 무엇을 달성할 것인가?" },
  { key: "m", label: "Measurable — 어떻게 측정할 것인가?" },
  { key: "a", label: "Achievable — 달성 가능한가?" },
  { key: "r", label: "Relevant — 목표와 관련이 있는가?" },
  { key: "t", label: "Time-bound — 언제까지 달성할 것인가?" },
];

/** 문항이 하나뿐인 블록의 고정 field_key. */
export const REFLECTION_FIELD_KEY = "answer";
export const SCALE_FIELD_KEY = "value";
