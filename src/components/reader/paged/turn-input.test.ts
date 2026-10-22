import { describe, expect, it } from "vitest";
import { keyTurn, startsOnControl, swipeTurn, tapTurn } from "./turn-input";

function key(key: string, overrides: Partial<KeyboardEvent> = {}) {
  return {
    key,
    isComposing: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    target: document.body,
    ...overrides,
  } as KeyboardEvent;
}

describe("쪽 넘김 키", () => {
  it("화살표와 PageUp/PageDown으로 넘긴다", () => {
    expect(keyTurn(key("ArrowRight"), false)).toBe("forward");
    expect(keyTurn(key("PageDown"), false)).toBe("forward");
    expect(keyTurn(key("ArrowLeft"), false)).toBe("back");
    expect(keyTurn(key("PageUp"), false)).toBe("back");
    expect(keyTurn(key("a"), false)).toBeNull();
  });

  it("글을 쓰는 중에는 넘기지 않는다", () => {
    // s-growthlab은 window에서 ←를 받아, 글을 고치다 커서를 옮기면 쪽이 넘어갔다.
    const textarea = document.createElement("textarea");
    expect(keyTurn(key("ArrowLeft", { target: textarea }), false)).toBeNull();
    const input = document.createElement("input");
    expect(keyTurn(key("ArrowRight", { target: input }), false)).toBeNull();
  });

  it("한글 조합 중·수정키·시트가 열린 동안에는 넘기지 않는다", () => {
    expect(keyTurn(key("ArrowRight", { isComposing: true }), false)).toBeNull();
    expect(keyTurn(key("ArrowRight", { metaKey: true }), false)).toBeNull();
    expect(keyTurn(key("ArrowLeft", { altKey: true }), false)).toBeNull();
    expect(keyTurn(key("ArrowRight"), true)).toBeNull();
  });
});

describe("탭과 스와이프", () => {
  it("좌우 20%만 넘긴다", () => {
    expect(tapTurn(0.1)).toBe("back");
    expect(tapTurn(0.5)).toBeNull();
    expect(tapTurn(0.9)).toBe("forward");
  });

  it("짧고 분명한 가로 스와이프만 넘긴다", () => {
    const start = { x: 200, y: 300, t: 0 };
    expect(swipeTurn(start, { x: 100, y: 310, t: 200 })).toBe("forward");
    expect(swipeTurn(start, { x: 300, y: 290, t: 200 })).toBe("back");
    // 너무 짧다
    expect(swipeTurn(start, { x: 170, y: 300, t: 200 })).toBeNull();
    // 세로가 우세하다(본문을 고르거나 스크롤하려는 것)
    expect(swipeTurn(start, { x: 120, y: 400, t: 200 })).toBeNull();
    // 너무 느리다
    expect(swipeTurn(start, { x: 100, y: 300, t: 900 })).toBeNull();
  });

  it("카드·버튼·링크 위에서 시작한 조작은 넘기지 않는다", () => {
    document.body.innerHTML = `
      <section data-workbook-card><p id="in-card">질문</p></section>
      <a href="/x"><span id="in-link">링크</span></a>
      <p id="text">본문</p>`;
    expect(startsOnControl(document.getElementById("in-card"))).toBe(true);
    expect(startsOnControl(document.getElementById("in-link"))).toBe(true);
    expect(startsOnControl(document.getElementById("text"))).toBe(false);
  });
});
