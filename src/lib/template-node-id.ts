import { nanoid } from "nanoid";

/**
 * 워크북 블록의 안정 ID.
 *
 * 블록 생성 시 1회 부여하고 절대 재생성하지 않습니다. 이 값이
 * `data-node-id`이자 `workbook_blocks.id`이며, 독자 응답이 이 키에
 * 매달려 있습니다. 파싱 중에 호출하지 마세요.
 */
export function generateNodeId(): string {
  return crypto.randomUUID();
}

/**
 * 블록 안에서 문항 하나를 가리키는 안정 키 (`workbook_block_fields.field_key`).
 *
 * 체크리스트 항목처럼 개수가 변하는 문항에 씁니다. 블록 안에서만
 * 고유하면 되므로 짧게 만듭니다.
 */
export function generateFieldKey(): string {
  return nanoid(10);
}
