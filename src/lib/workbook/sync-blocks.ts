import { isStorableBlockId, isStorableFieldKey } from "../template-node-id";
import { extractWorkbookBlocks } from "./extract-blocks";
import type { WorkbookBlock, WorkbookBlockField } from "./types";

/**
 * 챕터 HTML의 블록 정의를 DB에 반영하는 경로.
 *
 * 저작 측에서 `workbook_blocks` / `workbook_block_fields`에 쓰는 곳은
 * 여기 하나뿐입니다. 실제 쓰기는 `sync_chapter_workbook_blocks` RPC가
 * 한 트랜잭션으로 처리합니다 (마이그레이션 00002). 라우트는 그 앞에
 * 본문 대조를 붙인 `sync_chapter_workbook_blocks_if_current`(00009)를
 * 부릅니다.
 */

export { isStorableBlockId };

/**
 * RPC에 보낼 수 있는 블록만. 결과의 ID는 유효한 UUID이고 서로 다릅니다.
 *
 * 문항도 저장할 수 있는 것만 남깁니다 — 키가 비었거나 64자를 넘거나 블록
 * 안에서 겹치면 뺍니다. 그런 키 하나가 DB의 CHECK에 걸리면 장 전체의
 * 동기화가 롤백됩니다(코드 리뷰 3-P1-16).
 */
export function storableBlocks(
  blocks: readonly WorkbookBlock[],
): WorkbookBlock[] {
  const seen = new Set<string>();
  return blocks
    .filter((block) => {
      if (!isStorableBlockId(block.id) || seen.has(block.id)) return false;
      seen.add(block.id);
      return true;
    })
    .map((block) => {
      const fields = storableFields(block.fields);
      return fields.length === block.fields.length ? block : { ...block, fields };
    });
}

function storableFields(
  fields: readonly WorkbookBlockField[],
): WorkbookBlockField[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (!isStorableFieldKey(field.field_key) || seen.has(field.field_key)) {
      return false;
    }
    seen.add(field.field_key);
    return true;
  });
}

/**
 * 저장할 수 없어 빠지는 문항이 있는 블록.
 *
 * 에디터가 체크리스트 항목 키를 불러올 때 고치므로(`TemplateNodeIds`)
 * 업로드나 직접 편집한 본문에서만 나옵니다. 빠진 항목은 화면에는 보이지만
 * 독자가 체크해도 저장되지 않으니, 공개 전 검수가 차단 사유로 씁니다.
 */
export function blocksWithUnstorableFields(
  blocks: readonly WorkbookBlock[],
): WorkbookBlock[] {
  return blocks.filter(
    (block) => storableFields(block.fields).length !== block.fields.length,
  );
}

/**
 * 저장할 수 없어 버려지는 블록.
 *
 * `data-node-id`가 UUID가 아니거나 앞선 블록과 겹치는 경우입니다. 그런
 * 블록은 정의를 저장할 수 없고, 독자 응답도 `workbook_responses.block_id`
 * (UUID NOT NULL)에 매달 수 없어 리더에서 작성해도 사라집니다.
 *
 * 조용히 버리면 크리에이터는 워크북이 동작한다고 믿은 채 출간합니다.
 * 그래서 공개 전 체크리스트가 이 목록을 차단 항목으로 씁니다.
 */
export function unstorableBlocks(
  blocks: readonly WorkbookBlock[],
): WorkbookBlock[] {
  const storable = new Set(storableBlocks(blocks).map((block) => block.id));
  const kept = new Set<string>();
  return blocks.filter((block) => {
    if (storable.has(block.id) && !kept.has(block.id)) {
      kept.add(block.id);
      return false;
    }
    return true;
  });
}

/** `sync_chapter_workbook_blocks`가 돌려주는 요약. */
export interface WorkbookSyncCounts {
  blocks_upserted: number;
  blocks_removed: number;
  fields_upserted: number;
  fields_removed: number;
  /** 같은 책의 다른 장에서 옮겨 와 이 장을 가리키게 된 독자 답 (00007). */
  responses_repointed: number;
  /**
   * 다른 장·책이 이미 쓰고 있어 저장하지 않은 블록 ID (00007).
   *
   * 덮지 않고 건너뜁니다. 덮으면 저장할 때마다 블록이 두 곳을 오가고,
   * 한쪽에서 지우면 다른 쪽의 정의까지 사라집니다. 공개 전 검수가 같은
   * 상태를 차단 사유로 잡습니다.
   */
  conflicts: string[];
}

export type WorkbookSyncResult =
  | { ok: true; counts: WorkbookSyncCounts; skipped: number; stale?: true }
  | { ok: false; error: string; skipped: number };

/**
 * RPC를 호출할 수 있는 최소 인터페이스.
 *
 * Supabase 클라이언트 타입 전체를 끌어오지 않는 것은 테스트에서
 * 가짜 클라이언트를 넣기 위해서입니다.
 */
export interface WorkbookSyncClient {
  rpc(
    fn: "sync_chapter_workbook_blocks_if_current",
    args: {
      p_chapter_id: string;
      p_blocks: WorkbookBlock[];
      p_content_sha256: string;
    },
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * 챕터 HTML에서 블록 정의를 뽑아 DB에 반영합니다.
 *
 * `storedHtml`은 방금 DB에 쓴 본문과 글자 하나까지 같아야 합니다(sanitize한
 * 쪽). RPC가 그 해시를 지금 DB의 본문과 대조해, 그 사이 같은 장의 다른 저장이
 * 끼었으면 아무것도 쓰지 않고 `stale`을 돌려줍니다(코드 리뷰 4-P1-13). 그
 * 저장이 자기 본문으로 동기화하므로, 늦게 끝난 쪽이 옛 본문의 정의로 덮는
 * 일이 없습니다.
 *
 * 실패해도 던지지 않습니다. 챕터 본문은 이미 저장된 뒤이고, 여기서
 * 던지면 크리에이터에게는 글이 날아간 것처럼 보이기 때문입니다. 대신
 * 결과를 호출부가 응답에 실어 보내고, 공개 전 체크리스트가 본문과 DB가
 * 어긋난 상태를 잡습니다.
 */
export async function syncChapterWorkbookBlocks(
  client: WorkbookSyncClient,
  chapterId: string,
  storedHtml: string,
): Promise<WorkbookSyncResult> {
  const extracted = extractWorkbookBlocks(storedHtml);
  const blocks = storableBlocks(extracted);
  const skipped = extracted.length - blocks.length;

  const { data, error } = await client.rpc(
    "sync_chapter_workbook_blocks_if_current",
    {
      p_chapter_id: chapterId,
      p_blocks: blocks,
      p_content_sha256: await sha256Hex(storedHtml),
    },
  );

  if (error) return { ok: false, error: error.message, skipped };

  const counts = readCounts(data);
  return isStale(data)
    ? { ok: true, counts, skipped, stale: true }
    : { ok: true, counts, skipped };
}

/**
 * Postgres `encode(sha256(convert_to(text, 'UTF8')), 'hex')`와 같은 값.
 * Web Crypto라 서버(Node)와 테스트 환경 어디서나 같습니다.
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function isStale(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { stale?: unknown }).stale === true
  );
}

/**
 * RPC 반환값을 읽습니다. `conflicts`·`responses_repointed`는 00007에서
 * 늘었으므로, 00007 이전 DB에서는 비어 있는 것으로 봅니다.
 */
function readCounts(data: unknown): WorkbookSyncCounts {
  const raw = (data ?? {}) as Partial<Record<keyof WorkbookSyncCounts, unknown>>;
  const count = (value: unknown) => (typeof value === "number" ? value : 0);
  return {
    blocks_upserted: count(raw.blocks_upserted),
    blocks_removed: count(raw.blocks_removed),
    fields_upserted: count(raw.fields_upserted),
    fields_removed: count(raw.fields_removed),
    responses_repointed: count(raw.responses_repointed),
    conflicts: Array.isArray(raw.conflicts)
      ? raw.conflicts.filter((id): id is string => typeof id === "string")
      : [],
  };
}
