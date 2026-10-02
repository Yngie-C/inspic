import { describe, expect, it } from "vitest";
import {
  describeChecklist,
  describeSave,
  describeScale,
  withSaveState,
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

  it("서버가 거절해 큐에서 빠진 블록도 저장 안 됨이다 — 저장됨이 아니다", () => {
    // 실패는 블록 단위로 옵니다. 거절된 답은 다시 보낼 것이 없어 pending이
    // false지만, 그렇다고 저장된 것은 아닙니다.
    expect(
      describeSave(input({ hasAnswer: true, savedAt: NOW, failed: true })),
    ).toEqual({ text: "저장 안 됨", tone: "danger" });
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
    // 칸 자체가 선택을 보여 주므로 문구는 accent로 겹쳐 말하지 않는다.
    expect(describeScale(4)).toEqual({ text: "4 선택됨", tone: "muted" });
  });
});

describe("withSaveState", () => {
  const progress = { text: "3개 중 1개", tone: "muted" } as const;

  it("보내지 못한 응답이 있고 저장이 실패했으면 진행 문구 대신 실패를 말한다", () => {
    expect(
      withSaveState(progress, { pending: true, failed: true, savedAt: NOW }),
    ).toEqual({ text: "저장 안 됨", tone: "danger" });
  });

  it("이 블록이 실패하지 않았으면 진행 문구를 그대로 둔다", () => {
    expect(
      withSaveState(progress, { pending: true, failed: false, savedAt: null }),
    ).toBe(progress);
  });

  it("거절돼 큐에서 빠진 블록도 실패를 말한다", () => {
    expect(
      withSaveState(progress, { pending: false, failed: true, savedAt: null }),
    ).toEqual({ text: "저장 안 됨", tone: "danger" });
  });

  it("이번 세션에서 저장에 성공했으면 진행 문구 뒤에 저장됨을 붙인다", () => {
    expect(
      withSaveState(progress, { pending: false, failed: false, savedAt: NOW }),
    ).toEqual({ text: "3개 중 1개 · 저장됨", tone: "muted" });
  });

  it("저장 중이거나 불러온 답뿐이면 진행 문구를 그대로 둔다", () => {
    expect(
      withSaveState(progress, { pending: true, failed: false, savedAt: NOW }),
    ).toBe(progress);
    expect(
      withSaveState(progress, { pending: false, failed: false, savedAt: null }),
    ).toBe(progress);
  });
});
