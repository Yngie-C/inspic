// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  blocksWithUnstorableFields,
  isStorableBlockId,
  storableBlocks,
  syncChapterWorkbookBlocks,
  unstorableBlocks,
  type WorkbookSyncClient,
} from "./sync-blocks";
import type { WorkbookBlock } from "./types";

/**
 * 챕터 저장 → 블록 정의 반영의 경계.
 *
 * node 환경으로 돌립니다. 이 코드는 API 라우트에서 실행되는데, HTML
 * 파싱은 브라우저와 서버가 서로 다른 구현을 씁니다(html-dom-parser의
 * client/server 진입점). jsdom에서만 검증하면 실제로 도는 경로를
 * 확인하지 않은 셈이 됩니다.
 */

const VALID_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function block(id: string): WorkbookBlock {
  return {
    id,
    block_type: "reflection",
    order_index: 0,
    config: {},
    fields: [
      { field_key: "answer", label: "질문", input_type: "longtext", order_index: 0 },
    ],
  };
}

function reflectionHtml(nodeId: string | null): string {
  const idAttr = nodeId === null ? "" : ` data-node-id="${nodeId}"`;
  return `<section data-template-type="reflection"${idAttr} data-prompt="질문"></section>`;
}

/** 성공 응답을 내는 가짜 클라이언트. */
function okClient() {
  const rpc = vi.fn().mockResolvedValue({
    data: {
      blocks_upserted: 1,
      blocks_removed: 0,
      fields_upserted: 1,
      fields_removed: 0,
    },
    error: null,
  });
  return { client: { rpc } as unknown as WorkbookSyncClient, rpc };
}

describe("isStorableBlockId", () => {
  it("UUID 모양이면 통과한다", () => {
    expect(isStorableBlockId(VALID_ID)).toBe(true);
    // 버전·변형 비트를 따지지 않습니다 — uuid 컬럼에 들어가면 충분합니다.
    expect(isStorableBlockId("aaaaaaaa-0000-0000-0000-000000000001")).toBe(true);
  });

  it("UUID가 아니면 막는다", () => {
    expect(isStorableBlockId("block-1")).toBe(false);
    expect(isStorableBlockId("")).toBe(false);
    expect(isStorableBlockId(`${VALID_ID} `)).toBe(false);
  });
});

describe("storableBlocks / unstorableBlocks", () => {
  it("UUID가 아닌 블록을 갈라낸다", () => {
    const blocks = [block(VALID_ID), block("not-a-uuid")];

    expect(storableBlocks(blocks).map((b) => b.id)).toEqual([VALID_ID]);
    expect(unstorableBlocks(blocks).map((b) => b.id)).toEqual(["not-a-uuid"]);
  });

  it("중복 ID는 첫 번째만 남기고 나머지를 갈라낸다", () => {
    // 같은 ID를 두 번 보내면 ON CONFLICT가 터져 챕터 저장 전체가 실패합니다.
    const blocks = [block(VALID_ID), block(VALID_ID), block(OTHER_ID)];

    expect(storableBlocks(blocks).map((b) => b.id)).toEqual([VALID_ID, OTHER_ID]);
    expect(unstorableBlocks(blocks)).toHaveLength(1);
  });

  it("두 목록을 합치면 원래 개수가 된다", () => {
    const blocks = [block(VALID_ID), block("x"), block(VALID_ID), block(OTHER_ID)];

    expect(storableBlocks(blocks).length + unstorableBlocks(blocks).length).toBe(
      blocks.length,
    );
  });
});

describe("문항 키 거르기", () => {
  function checklist(keys: string[]): WorkbookBlock {
    return {
      id: VALID_ID,
      block_type: "checklist",
      order_index: 0,
      config: {},
      fields: keys.map((key, index) => ({
        field_key: key,
        label: `항목 ${index + 1}`,
        input_type: "boolean" as const,
        order_index: index,
      })),
    };
  }

  it("비었거나 64자를 넘거나 겹치는 키는 보내지 않는다 — 장 전체 롤백을 막는다", () => {
    const blocks = [checklist(["a", "", "x".repeat(65), "a", "b"])];

    const [stored] = storableBlocks(blocks);

    expect(stored.fields.map((field) => field.field_key)).toEqual(["a", "b"]);
    expect(blocksWithUnstorableFields(blocks)).toHaveLength(1);
  });

  it("문제가 없으면 블록을 그대로 둔다", () => {
    const blocks = [checklist(["a", "b"])];

    expect(storableBlocks(blocks)[0]).toBe(blocks[0]);
    expect(blocksWithUnstorableFields(blocks)).toEqual([]);
  });
});

describe("syncChapterWorkbookBlocks", () => {
  it("다른 장·책과 겹쳐 건너뛴 블록을 결과에 싣는다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        blocks_upserted: 0,
        blocks_removed: 0,
        fields_upserted: 0,
        fields_removed: 0,
        responses_repointed: 0,
        conflicts: [VALID_ID],
      },
      error: null,
    });

    const result = await syncChapterWorkbookBlocks(
      { rpc } as unknown as WorkbookSyncClient,
      "ch-1",
      reflectionHtml(VALID_ID),
    );

    expect(result).toMatchObject({ ok: true, counts: { conflicts: [VALID_ID] } });
  });

  it("00007 이전 DB의 반환값이면 충돌 없음으로 본다", async () => {
    const { client } = okClient();

    const result = await syncChapterWorkbookBlocks(
      client,
      "ch-1",
      reflectionHtml(VALID_ID),
    );

    expect(result).toMatchObject({
      ok: true,
      counts: { conflicts: [], responses_repointed: 0 },
    });
  });

  it("HTML에서 뽑은 블록을 RPC에 넘긴다", async () => {
    const { client, rpc } = okClient();

    const result = await syncChapterWorkbookBlocks(
      client,
      "ch-1",
      `<p>본문</p>${reflectionHtml(VALID_ID)}`,
    );

    expect(rpc).toHaveBeenCalledWith("sync_chapter_workbook_blocks", {
      p_chapter_id: "ch-1",
      p_blocks: [expect.objectContaining({ id: VALID_ID, block_type: "reflection" })],
    });
    expect(result).toMatchObject({ ok: true, skipped: 0 });
  });

  it("블록이 없어도 RPC를 부른다 — 지워진 블록을 정리해야 한다", async () => {
    const { client, rpc } = okClient();

    await syncChapterWorkbookBlocks(client, "ch-1", "<p>글만 있는 챕터</p>");

    expect(rpc).toHaveBeenCalledWith("sync_chapter_workbook_blocks", {
      p_chapter_id: "ch-1",
      p_blocks: [],
    });
  });

  it("저장할 수 없는 블록은 빼고 보내되 몇 개를 뺐는지 알려준다", async () => {
    const { client, rpc } = okClient();

    const result = await syncChapterWorkbookBlocks(
      client,
      "ch-1",
      reflectionHtml(VALID_ID) + reflectionHtml("not-a-uuid"),
    );

    expect(rpc.mock.calls[0][1].p_blocks).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("data-node-id가 없는 블록은 애초에 추출되지 않는다", async () => {
    // 여기서 ID를 만들어 붙이면 저장할 때마다 키가 바뀌어 응답이 끊깁니다.
    // 그래서 건너뜁니다 — 대신 공개 전 검수가 이 상태를 차단합니다.
    const { client, rpc } = okClient();

    const result = await syncChapterWorkbookBlocks(
      client,
      "ch-1",
      reflectionHtml(null),
    );

    expect(rpc.mock.calls[0][1].p_blocks).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it("RPC가 실패해도 던지지 않는다", async () => {
    // 챕터 본문은 이미 저장된 뒤입니다. 여기서 던지면 크리에이터에게는
    // 글이 날아간 것처럼 보입니다.
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "permission denied" },
      }),
    } as unknown as WorkbookSyncClient;

    const result = await syncChapterWorkbookBlocks(
      client,
      "ch-1",
      reflectionHtml(VALID_ID),
    );

    expect(result).toEqual({ ok: false, error: "permission denied", skipped: 0 });
  });
});
