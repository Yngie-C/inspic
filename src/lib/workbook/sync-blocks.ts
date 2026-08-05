import { extractWorkbookBlocks } from "./extract-blocks";
import type { WorkbookBlock } from "./types";

/**
 * 챕터 HTML의 블록 정의를 DB에 반영하는 경로.
 *
 * 저작 측에서 `workbook_blocks` / `workbook_block_fields`에 쓰는 곳은
 * 여기 하나뿐입니다. 실제 쓰기는 `sync_chapter_workbook_blocks` RPC가
 * 한 트랜잭션으로 처리합니다 (마이그레이션 00002).
 */

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
  return UUID_RE.test(id);
}

/** RPC에 보낼 수 있는 블록만. 결과의 ID는 유효한 UUID이고 서로 다릅니다. */
export function storableBlocks(
  blocks: readonly WorkbookBlock[],
): WorkbookBlock[] {
  const seen = new Set<string>();
  return blocks.filter((block) => {
    if (!isStorableBlockId(block.id) || seen.has(block.id)) return false;
    seen.add(block.id);
    return true;
  });
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
}

export type WorkbookSyncResult =
  | { ok: true; counts: WorkbookSyncCounts; skipped: number }
  | { ok: false; error: string; skipped: number };

/**
 * RPC를 호출할 수 있는 최소 인터페이스.
 *
 * Supabase 클라이언트 타입 전체를 끌어오지 않는 것은 테스트에서
 * 가짜 클라이언트를 넣기 위해서입니다.
 */
export interface WorkbookSyncClient {
  rpc(
    fn: "sync_chapter_workbook_blocks",
    args: { p_chapter_id: string; p_blocks: WorkbookBlock[] },
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * 챕터 HTML에서 블록 정의를 뽑아 DB에 반영합니다.
 *
 * 호출 시점의 HTML은 이미 sanitize된 것이어야 합니다 — 저장된 본문과
 * 다른 HTML에서 뽑으면 블록 정의가 본문과 어긋납니다.
 *
 * 실패해도 던지지 않습니다. 챕터 본문은 이미 저장된 뒤이고, 여기서
 * 던지면 크리에이터에게는 글이 날아간 것처럼 보이기 때문입니다. 대신
 * 결과를 호출부가 응답에 실어 보내고, 공개 전 체크리스트가 본문과 DB가
 * 어긋난 상태를 잡습니다.
 */
export async function syncChapterWorkbookBlocks(
  client: WorkbookSyncClient,
  chapterId: string,
  sanitizedHtml: string,
): Promise<WorkbookSyncResult> {
  const extracted = extractWorkbookBlocks(sanitizedHtml);
  const blocks = storableBlocks(extracted);
  const skipped = extracted.length - blocks.length;

  const { data, error } = await client.rpc("sync_chapter_workbook_blocks", {
    p_chapter_id: chapterId,
    p_blocks: blocks,
  });

  if (error) return { ok: false, error: error.message, skipped };

  return { ok: true, counts: data as WorkbookSyncCounts, skipped };
}
