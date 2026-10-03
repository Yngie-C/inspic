import { describe, expect, it } from "vitest";
import {
  blockers,
  canPublish,
  runPublishChecks,
  warnings,
  type PublishCheckChapter,
  type PublishCheckInput,
  type StoredBlock,
} from "./publish-checks";

/**
 * 공개 전 검수.
 *
 * 여기서 가장 중요한 것은 "차단해야 할 것을 차단하는가"입니다. 워크북
 * 블록이 응답을 받을 수 없는 상태로 출간되면 독자가 작성한 내용이
 * 사라지는데, 크리에이터는 자기 화면에서 그걸 볼 수 없습니다.
 */

const BLOCK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_BLOCK_ID = "22222222-2222-4222-8222-222222222222";

function reflectionHtml(nodeId: string | null): string {
  const idAttr = nodeId === null ? "" : ` data-node-id="${nodeId}"`;
  return (
    `<section data-template-type="reflection"${idAttr} ` +
    `data-prompt="무엇을 배웠나요?"></section>`
  );
}

function chapter(overrides: Partial<PublishCheckChapter> = {}): PublishCheckChapter {
  return {
    id: "ch-1",
    title: "1장",
    content_html: "<p>본문입니다.</p>",
    status: "published",
    order_index: 0,
    ...overrides,
  };
}

function input(overrides: Partial<PublishCheckInput> = {}): PublishCheckInput {
  return {
    book: {
      title: "나의 워크북",
      description: "소개글",
      cover_image_url: "https://example.com/cover.png",
      price: 0,
    },
    chapters: [chapter()],
    storedBlocks: [],
    ...overrides,
  };
}

const REFLECTION_FIELDS = [{ field_key: "answer", input_type: "longtext" }];

function stored(
  id: string,
  chapterId = "ch-1",
  fields: StoredBlock["fields"] = REFLECTION_FIELDS,
): StoredBlock {
  return { id, chapter_id: chapterId, fields };
}

function checklistHtml(nodeId: string, items: Array<{ id: string; text: string }>) {
  const encoded = JSON.stringify(items).replace(/"/g, "&quot;");
  return `<section data-template-type="checklist" data-node-id="${nodeId}" data-items="${encoded}"></section>`;
}

function ids(checks: ReturnType<typeof runPublishChecks>): string[] {
  return checks.map((check) => check.id);
}

describe("차단 항목", () => {
  it("제목이 비어 있으면 막는다", () => {
    const checks = runPublishChecks(
      input({ book: { title: "  ", description: "d", cover_image_url: "c", price: 0 } }),
    );

    expect(ids(blockers(checks))).toContain("title");
    expect(canPublish(checks)).toBe(false);
  });

  it("챕터가 없으면 막는다", () => {
    const checks = runPublishChecks(input({ chapters: [] }));

    expect(ids(blockers(checks))).toContain("no-chapters");
  });

  it("공개한 장이 하나도 없으면 막는다 — 독자에게는 빈 책이다 (4-P1-20)", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({ status: "draft" }),
          chapter({ id: "ch-2", title: "2장", status: "draft", order_index: 1 }),
        ],
      }),
    );

    const blocked = blockers(checks).find((c) => c.id === "no-published-chapters");
    expect(blocked?.chapterIds).toEqual(["ch-1", "ch-2"]);
    expect(canPublish(checks)).toBe(false);
    // 같은 사실을 경고로 한 번 더 말하지 않습니다.
    expect(ids(warnings(checks))).not.toContain("draft-chapters");
  });

  it("본문이 빈 장은 경고로 알리고 어느 장인지 말한다 (4-P1-24)", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter(),
          chapter({ id: "ch-2", title: "2장", content_html: "<p></p>", order_index: 1 }),
        ],
      }),
    );

    const warned = warnings(checks).find((check) => check.id === "empty-chapters");
    expect(warned?.detail).toContain("2장");
    expect(warned?.chapterIds).toEqual(["ch-2"]);
    expect(canPublish(checks)).toBe(true);
  });

  it("&nbsp;만 있는 챕터도 빈 챕터로 본다", () => {
    const checks = runPublishChecks(
      input({ chapters: [chapter({ content_html: "<p>&nbsp;</p>" })] }),
    );

    expect(ids(warnings(checks))).toContain("empty-chapters");
  });

  it("이미지만 있는 장은 빈 장이 아니다 (4-P1-23)", () => {
    const checks = runPublishChecks(
      input({
        chapters: [chapter({ content_html: '<p><img src="https://example.com/a.png" alt=""></p>' })],
      }),
    );

    expect(ids(checks)).not.toContain("empty-chapters");
  });

  it("data-node-id가 없는 워크북 블록을 막는다", () => {
    // 저작 화면에서는 멀쩡히 보이지만 독자 응답을 매달 키가 없습니다.
    const checks = runPublishChecks(
      input({
        chapters: [chapter({ content_html: `<p>가</p>${reflectionHtml(null)}` })],
      }),
    );

    expect(ids(blockers(checks))).toContain("broken-blocks");
  });

  it("ID가 UUID가 아닌 블록을 막는다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [chapter({ content_html: reflectionHtml("not-a-uuid") })],
      }),
    );

    expect(ids(blockers(checks))).toContain("broken-blocks");
  });

  it("ID가 겹치는 블록을 막는다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({
            content_html: reflectionHtml(BLOCK_ID) + reflectionHtml(BLOCK_ID),
          }),
        ],
        storedBlocks: [stored(BLOCK_ID)],
      }),
    );

    expect(ids(blockers(checks))).toContain("broken-blocks");
  });

  it("본문에는 있는데 DB에 저장되지 않은 블록을 막는다", () => {
    // 챕터 저장 중 동기화가 실패한 상태. 그대로 출간하면 독자가 쓴
    // 내용이 저장되지 않습니다.
    const checks = runPublishChecks(
      input({
        chapters: [chapter({ content_html: reflectionHtml(BLOCK_ID) })],
        storedBlocks: [],
      }),
    );

    expect(ids(blockers(checks))).toContain("unsynced-blocks");
  });

  it("DB에서 다른 장 소속인 블록은 이 장에 저장되지 않은 것이다", () => {
    // 책 전체의 ID만 보면 "저장됨"으로 오인합니다(4-P0-3).
    const checks = runPublishChecks(
      input({
        chapters: [chapter({ content_html: reflectionHtml(BLOCK_ID) })],
        storedBlocks: [stored(BLOCK_ID, "ch-other")],
      }),
    );

    expect(ids(blockers(checks))).toContain("unsynced-blocks");
  });

  it("같은 블록 ID가 두 장에 있으면 막고, 복사본 쪽 장을 알려준다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({ id: "ch-1", title: "원본 장", content_html: reflectionHtml(BLOCK_ID) }),
          chapter({
            id: "ch-2",
            title: "복사한 장",
            order_index: 1,
            content_html: reflectionHtml(BLOCK_ID),
          }),
        ],
        storedBlocks: [stored(BLOCK_ID, "ch-1")],
      }),
    );

    const duplicated = blockers(checks).find((c) => c.id === "duplicated-blocks");
    expect(duplicated?.detail).toContain("복사한 장");
    expect(duplicated?.detail).not.toContain("원본 장");
    // 같은 원인을 "저장되지 않음"으로 한 번 더 말하지 않습니다.
    expect(ids(blockers(checks))).not.toContain("unsynced-blocks");
  });

  it("체크리스트 항목 키가 겹치거나 너무 길면 막는다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({
            content_html: checklistHtml(BLOCK_ID, [
              { id: "k", text: "하나" },
              { id: "k", text: "둘" },
            ]),
          }),
        ],
        storedBlocks: [stored(BLOCK_ID, "ch-1", [{ field_key: "k", input_type: "boolean" }])],
      }),
    );

    expect(ids(blockers(checks))).toContain("broken-blocks");
  });

  it("블록은 저장됐는데 새로 넣은 문항이 DB에 없으면 막는다 (4-P1-21)", () => {
    // 항목을 더하고 저장했는데 동기화만 실패한 상태. 출간 뒤 그 항목의
    // 답은 전부 거절됩니다.
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({
            content_html: checklistHtml(BLOCK_ID, [
              { id: "a", text: "하나" },
              { id: "b", text: "새 항목" },
            ]),
          }),
        ],
        storedBlocks: [stored(BLOCK_ID, "ch-1", [{ field_key: "a", input_type: "boolean" }])],
      }),
    );

    expect(ids(blockers(checks))).toContain("unsynced-blocks");
  });

  it("문항의 입력 타입이 DB와 다르면 막는다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [chapter({ content_html: reflectionHtml(BLOCK_ID) })],
        storedBlocks: [stored(BLOCK_ID, "ch-1", [{ field_key: "answer", input_type: "integer" }])],
      }),
    );

    expect(ids(blockers(checks))).toContain("unsynced-blocks");
  });

  it("DB에만 남은 옛 문항은 막지 않는다 — 독자 화면에 없는 문항이다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({ content_html: checklistHtml(BLOCK_ID, [{ id: "a", text: "하나" }]) }),
        ],
        storedBlocks: [
          stored(BLOCK_ID, "ch-1", [
            { field_key: "a", input_type: "boolean" },
            { field_key: "gone", input_type: "boolean" },
          ]),
        ],
      }),
    );

    expect(blockers(checks)).toEqual([]);
  });

  it("차단 항목은 해당 장을 가리킨다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter(),
          chapter({ id: "ch-2", title: "2장", order_index: 1, content_html: reflectionHtml(BLOCK_ID) }),
        ],
      }),
    );

    expect(blockers(checks).find((c) => c.id === "unsynced-blocks")?.chapterIds).toEqual([
      "ch-2",
    ]);
  });

  it("DB에 저장된 블록은 막지 않는다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [chapter({ content_html: reflectionHtml(BLOCK_ID) })],
        storedBlocks: [stored(BLOCK_ID), stored(OTHER_BLOCK_ID, "ch-2")],
      }),
    );

    expect(blockers(checks)).toHaveLength(0);
    expect(canPublish(checks)).toBe(true);
  });
});

describe("draft 장은 본문 검사에서 뺀다 (4-P1-22)", () => {
  it("draft 장이 비었거나 블록이 깨져도 막지 않는다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter(),
          chapter({ id: "ch-2", title: "쓰는 중", status: "draft", order_index: 1, content_html: "" }),
          chapter({
            id: "ch-3",
            title: "블록 깨짐",
            status: "draft",
            order_index: 2,
            content_html: reflectionHtml(null) + reflectionHtml(OTHER_BLOCK_ID),
          }),
        ],
      }),
    );

    expect(blockers(checks)).toEqual([]);
    expect(ids(warnings(checks))).not.toContain("empty-chapters");
  });

  it("draft 장의 블록이 '답할 블록 없음' 경고를 가리지 않는다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter(),
          chapter({
            id: "ch-2",
            status: "draft",
            order_index: 1,
            content_html: reflectionHtml(BLOCK_ID),
          }),
        ],
        storedBlocks: [stored(BLOCK_ID, "ch-2")],
      }),
    );

    expect(ids(warnings(checks))).toContain("no-workbook-blocks");
  });

  it("draft 장에 복사된 블록은 공개 장을 막지 않는다 — DB 소속이 공개 장일 때", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({ content_html: reflectionHtml(BLOCK_ID) }),
          chapter({ id: "ch-2", status: "draft", order_index: 1, content_html: reflectionHtml(BLOCK_ID) }),
        ],
        storedBlocks: [stored(BLOCK_ID, "ch-1")],
      }),
    );

    expect(blockers(checks)).toEqual([]);
  });

  it("DB가 draft 장을 소속으로 기록했으면 공개 장의 블록은 답을 받지 못한다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({ title: "공개 장", content_html: reflectionHtml(BLOCK_ID) }),
          chapter({
            id: "ch-2",
            title: "초안 장",
            status: "draft",
            order_index: 1,
            content_html: reflectionHtml(BLOCK_ID),
          }),
        ],
        storedBlocks: [stored(BLOCK_ID, "ch-2")],
      }),
    );

    const duplicated = blockers(checks).find((c) => c.id === "duplicated-blocks");
    expect(duplicated?.chapterIds).toEqual(["ch-1"]);
    expect(duplicated?.detail).not.toContain("초안 장");
  });
});

describe("경고 항목", () => {
  it("유료 책인데 공개 장이 하나면 경고한다 — 미리보기로 통째로 열린다", () => {
    const checks = runPublishChecks(
      input({
        book: { title: "제목", description: "d", cover_image_url: "c", price: 15000 },
        chapters: [
          chapter(),
          chapter({ id: "ch-2", status: "draft", order_index: 1 }),
        ],
      }),
    );

    expect(ids(warnings(checks))).toContain("paid-single-chapter");
    expect(canPublish(checks)).toBe(true);
  });

  it("유료 책에 공개 장이 둘이거나, 무료 책이면 그 경고는 없다", () => {
    const paidTwo = runPublishChecks(
      input({
        book: { title: "제목", description: "d", cover_image_url: "c", price: 15000 },
        chapters: [chapter(), chapter({ id: "ch-2", order_index: 1 })],
      }),
    );
    const freeOne = runPublishChecks(input());

    expect(ids(paidTwo)).not.toContain("paid-single-chapter");
    expect(ids(freeOne)).not.toContain("paid-single-chapter");
  });

  it("콜아웃만 있으면 답할 블록이 없다고 경고한다 (4-P2-11)", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({
            content_html: `<p>가</p><div data-template-type="callout" data-node-id="${BLOCK_ID}" data-callout-type="tip"><p>팁</p></div>`,
          }),
        ],
        storedBlocks: [stored(BLOCK_ID, "ch-1", [])],
      }),
    );

    expect(ids(warnings(checks))).toContain("no-workbook-blocks");
  });

  it("항목이 없는 체크리스트를 경고한다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({ content_html: `<p>가</p>${checklistHtml(BLOCK_ID, [])}${reflectionHtml(OTHER_BLOCK_ID)}` }),
        ],
        storedBlocks: [stored(BLOCK_ID, "ch-1", []), stored(OTHER_BLOCK_ID)],
      }),
    );

    expect(ids(warnings(checks))).toContain("empty-checklists");
    expect(canPublish(checks)).toBe(true);
  });

  it("워크북 블록이 없으면 경고하되 막지는 않는다", () => {
    const checks = runPublishChecks(input());

    expect(ids(warnings(checks))).toContain("no-workbook-blocks");
    expect(canPublish(checks)).toBe(true);
  });

  it("표지와 소개글이 없으면 경고한다", () => {
    const checks = runPublishChecks(
      input({
        book: { title: "제목", description: null, cover_image_url: null, price: 0 },
      }),
    );

    expect(ids(warnings(checks))).toEqual(
      expect.arrayContaining(["cover", "description"]),
    );
    expect(canPublish(checks)).toBe(true);
  });

  it("미발행 챕터를 경고한다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter(),
          chapter({ id: "ch-2", title: "2장", status: "draft", order_index: 1 }),
        ],
      }),
    );

    const warning = warnings(checks).find((check) => check.id === "draft-chapters");
    expect(warning?.detail).toContain("2장");
  });

  it("base64 인라인 이미지를 경고한다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({
            content_html: '<p>가</p><img src="data:image/png;base64,AAAA" alt="">',
          }),
        ],
      }),
    );

    expect(ids(warnings(checks))).toContain("inline-images");
    expect(canPublish(checks)).toBe(true);
  });

  it("제목 없는 장은 목록의 순번으로 가리킨다 — order_index의 틈과 무관 (4-P2-12)", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({ order_index: 0 }),
          chapter({ id: "ch-2", title: "   ", content_html: "<p></p>", order_index: 5 }),
        ],
      }),
    );

    const warned = warnings(checks).find((check) => check.id === "empty-chapters");
    expect(warned?.detail).toContain("2장 —");
  });
});

describe("전부 통과", () => {
  it("문제가 없으면 경고도 차단도 없다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [chapter({ content_html: `<p>가</p>${reflectionHtml(BLOCK_ID)}` })],
        storedBlocks: [stored(BLOCK_ID)],
      }),
    );

    expect(checks).toEqual([]);
    expect(canPublish(checks)).toBe(true);
  });
});
