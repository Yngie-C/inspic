import { describe, expect, it } from "vitest";
import {
  describeChecklist,
  describeSave,
  describeScale,
  type SaveStatusInput,
} from "./block-status";

const NOW = 1_000_000_000;

function input(overrides: Partial<SaveStatusInput> = {}): SaveStatusInput {
  return {
    hasAnswer: false,
    pending: false,
    savedAt: null,
    failed: false,
    now: NOW,
    ...overrides,
  };
}

describe("describeSave", () => {
  it("답이 없으면 작성 전", () => {
    expect(describeSave(input())).toEqual({ text: "작성 전", tone: "muted" });
  });

  it("보내는 중이면 저장 중", () => {
    expect(describeSave(input({ hasAnswer: true, pending: true }))).toEqual({
      text: "저장 중",
      tone: "muted",
    });
  });

  it("못 보낸 채 저장이 실패하면 저장 안 됨", () => {
    expect(
      describeSave(input({ hasAnswer: true, pending: true, failed: true })),
    ).toEqual({ text: "저장 안 됨", tone: "danger" });
  });

  it("이 블록은 다 보냈으면 다른 블록의 실패와 무관하다", () => {
    expect(
      describeSave(input({ hasAnswer: true, savedAt: NOW, failed: true })),
    ).toEqual({ text: "저장됨 · 방금", tone: "ok" });
  });

  it("저장 시각을 분·시간으로 말한다", () => {
    expect(
      describeSave(input({ hasAnswer: true, savedAt: NOW - 5 * 60_000 })).text,
    ).toBe("저장됨 · 5분 전");
    expect(
      describeSave(input({ hasAnswer: true, savedAt: NOW - 2 * 3_600_000 }))
        .text,
    ).toBe("저장됨 · 2시간 전");
  });

  it("이 세션에서 저장하지 않은 답을 저장됐다고 하지 않는다", () => {
    // 불러온 답이 서버 것인지 이 기기 캐시에만 있는지 구분할 수 없다.
    expect(describeSave(input({ hasAnswer: true }))).toEqual({
      text: "작성함",
      tone: "muted",
    });
  });
});

describe("describeChecklist", () => {
  it("모두 채워야 accent", () => {
    expect(describeChecklist(3, 2)).toEqual({ text: "3개 중 2개", tone: "muted" });
    expect(describeChecklist(3, 3)).toEqual({ text: "3개 중 3개", tone: "ok" });
    expect(describeChecklist(0, 0).tone).toBe("muted");
  });
});

describe("describeScale", () => {
  it("고른 값을 말한다", () => {
    expect(describeScale(null)).toEqual({ text: "작성 전", tone: "muted" });
    expect(describeScale(4)).toEqual({ text: "4 선택됨", tone: "ok" });
  });
});
