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
    storedBlockIds: [],
    ...overrides,
  };
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
        storedBlockIds: [BLOCK_ID],
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
        storedBlockIds: [],
      }),
    );

    expect(ids(blockers(checks))).toContain("unsynced-blocks");
  });

  it("DB에 저장된 블록은 막지 않는다", () => {
    const checks = runPublishChecks(
      input({
        chapters: [chapter({ content_html: reflectionHtml(BLOCK_ID) })],
        storedBlockIds: [BLOCK_ID, OTHER_BLOCK_ID],
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
        storedBlockIds: [BLOCK_ID],
      }),
    );

    expect(checks).toEqual([]);
    expect(canPublish(checks)).toBe(true);
  });
});
