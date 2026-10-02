import { nanoid } from "nanoid";

/**
 * 워크북 블록의 안정 ID.
 *
 * 블록이 문서에 들어올 때 1회 부여하고 그 뒤로 바꾸지 않습니다. 이 값이
 * `data-node-id`이자 `workbook_blocks.id`이며, 독자 응답이 이 키에
 * 매달려 있습니다. 파싱 중에 호출하지 마세요.
 *
 * "들어올 때"에는 붙여넣기가 포함됩니다. 복사본이 원본 ID를 그대로 들고
 * 오면 두 블록이 한 응답을 나눠 갖습니다(`TemplateNodeIds.ts`).
 */
export function generateNodeId(): string {
  // `randomUUID`는 보안 컨텍스트(HTTPS·localhost)에만 있습니다. LAN 주소로
  // 모바일에서 확인하거나 구형 Safari면 없어서, 블록 삽입이 통째로
  // 던집니다. `getRandomValues`는 그런 곳에서도 있습니다.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return uuidV4FromRandomValues();
}

/** RFC 4122 v4 UUID를 `crypto.getRandomValues`로 조립합니다. */
export function uuidV4FromRandomValues(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/**
 * `workbook_blocks.id`가 UUID 컬럼이므로 ID도 UUID여야 합니다.
 *
 * 버전·변형 비트는 보지 않습니다. 판정 기준은 "RFC 4122 v4인가"가 아니라
 * "Postgres의 uuid 컬럼에 들어가는가"이고, 여기서 더 엄격하게 굴면 저장할
 * 수 있는 블록을 버리게 됩니다.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isStorableBlockId(id: string): boolean {
  return isUuid(id);
}

/** Postgres의 uuid 컬럼에 들어가는 문자열인가. 라우트의 경로 인자 검사에도 씁니다. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
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

/** `workbook_block_fields.field_key`의 CHECK 제약 (00001). */
export const MAX_FIELD_KEY_LENGTH = 64;

/**
 * DB에 저장할 수 있는 문항 키인가.
 *
 * 한도를 넘는 키 하나가 CHECK에 걸리면 그 챕터의 동기화 트랜잭션이
 * 통째로 롤백됩니다. 그래서 DB보다 먼저 여기서 거릅니다.
 */
export function isStorableFieldKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length <= MAX_FIELD_KEY_LENGTH
  );
}
