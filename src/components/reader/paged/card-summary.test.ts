import { describe, expect, it } from "vitest";
import { summarizeBlock } from "./card-summary";

const ITEMS = JSON.stringify([
  { id: "a", text: "터미널 열기" },
  { id: "b", text: "폴더 만들기" },
  { id: "c", text: "claude 실행하기" },
]);

describe("워크북 카드 요약", () => {
  it("체크리스트: 앞 두 항목과 남은 수, 체크한 항목, 진행", () => {
    const summary = summarizeBlock("checklist", { "data-items": ITEMS }, { a: true, b: false });
    expect(summary).toEqual({
      kind: "체크리스트",
      question: "터미널 열기 · 폴더 만들기 외 1개",
      preview: "터미널 열기",
      progress: { text: "3개 중 1개", tone: "muted" },
    });
  });

  it("체크리스트: 체크 해제는 완료로 세지 않는다", () => {
    const summary = summarizeBlock("checklist", { "data-items": ITEMS }, { a: false });
    expect(summary?.preview).toBeNull();
    expect(summary?.progress?.text).toBe("3개 중 0개");
  });

  it("척도: 고른 값과 블록과 같은 상태 문구", () => {
    const attrs = { "data-min": "1", "data-max": "10", "data-label-min": "전혀", "data-label-max": "매우" };
    expect(summarizeBlock("scale", attrs, { value: 7 })).toMatchObject({
      question: "전혀에서 매우까지",
      preview: "고른 값 7",
      progress: { text: "7 선택됨" },
    });
    expect(summarizeBlock("scale", attrs, {})?.progress?.text).toBe("작성 전");
  });

  it("척도: 범위 밖에 남은 예전 답은 미리보기에 싣지 않고 그렇다고 말한다", () => {
    const summary = summarizeBlock("scale", { "data-min": "1", "data-max": "5" }, { value: 9 });
    expect(summary?.preview).toBeNull();
    expect(summary?.progress?.text).toBe("예전 답 9 · 다시 골라 주세요");
  });

  it("성찰: 공백뿐인 답은 쓰지 않은 것으로 본다", () => {
    const attrs = { "data-prompt": "한 가지를 적어 보세요." };
    expect(summarizeBlock("reflection", attrs, { answer: "  \n " })?.preview).toBeNull();
    expect(summarizeBlock("reflection", attrs, { answer: "공고부터 본다" })).toMatchObject({
      kind: "성찰",
      question: "한 가지를 적어 보세요.",
      preview: "공고부터 본다",
      progress: null,
    });
  });

  it("목표: 처음 채운 칸을 미리보기로 싣는다", () => {
    const summary = summarizeBlock("smart-goal", {}, { m: "주 3회", t: "12월까지" });
    expect(summary?.kind).toBe("목표");
    expect(summary?.preview).toBe("주 3회");
  });

  it("카드가 아닌 블록은 요약하지 않는다", () => {
    expect(summarizeBlock("callout", {}, {})).toBeNull();
    expect(summarizeBlock("constructor", {}, {})).toBeNull();
  });
});
