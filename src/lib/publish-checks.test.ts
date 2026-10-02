import { describe, expect, it } from "vitest";
import {
  blockers,
  canPublish,
  runPublishChecks,
  warnings,
  type PublishCheckChapter,
  type PublishCheckInput,
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
    },
    chapters: [chapter()],
    storedBlocks: [],
    ...overrides,
  };
}

function stored(id: string, chapterId = "ch-1") {
  return { id, chapter_id: chapterId };
}

function ids(checks: ReturnType<typeof runPublishChecks>): string[] {
  return checks.map((check) => check.id);
}

describe("차단 항목", () => {
  it("제목이 비어 있으면 막는다", () => {
    const checks = runPublishChecks(
      input({ book: { title: "  ", description: "d", cover_image_url: "c" } }),
    );

    expect(ids(blockers(checks))).toContain("title");
    expect(canPublish(checks)).toBe(false);
  });

  it("챕터가 없으면 막는다", () => {
    const checks = runPublishChecks(input({ chapters: [] }));

    expect(ids(blockers(checks))).toContain("no-chapters");
  });

  it("본문이 빈 챕터를 막고 어느 챕터인지 알려준다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter(),
          chapter({ id: "ch-2", title: "2장", content_html: "<p></p>", order_index: 1 }),
        ],
      }),
    );

    const blocked = blockers(checks).find((check) => check.id === "empty-chapters");
    expect(blocked?.detail).toContain("2장");
  });

  it("&nbsp;만 있는 챕터도 빈 챕터로 본다", () => {
    const checks = runPublishChecks(
      input({ chapters: [chapter({ content_html: "<p>&nbsp;</p>" })] }),
    );

    expect(ids(blockers(checks))).toContain("empty-chapters");
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
    const items = JSON.stringify([
      { id: "k", text: "하나" },
      { id: "k", text: "둘" },
    ]).replace(/"/g, "&quot;");
    const checks = runPublishChecks(
      input({
        chapters: [
          chapter({
            content_html: `<section data-template-type="checklist" data-node-id="${BLOCK_ID}" data-items="${items}"></section>`,
          }),
        ],
        storedBlocks: [stored(BLOCK_ID)],
      }),
    );

    expect(ids(blockers(checks))).toContain("broken-blocks");
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

describe("경고 항목", () => {
  it("워크북 블록이 없으면 경고하되 막지는 않는다", () => {
    const checks = runPublishChecks(input());

    expect(ids(warnings(checks))).toContain("no-workbook-blocks");
    expect(canPublish(checks)).toBe(true);
  });

  it("표지와 소개글이 없으면 경고한다", () => {
    const checks = runPublishChecks(
      input({
        book: { title: "제목", description: null, cover_image_url: null },
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

  it("제목 없는 장은 순번으로 가리킨다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [chapter({ title: "   ", content_html: "<p></p>", order_index: 2 })],
      }),
    );

    const blocked = blockers(checks).find((check) => check.id === "empty-chapters");
    expect(blocked?.detail).toContain("3장 —");
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
