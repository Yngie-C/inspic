import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCALE_RANGE,
  MAX_SCALE_STEPS,
  calloutTypeOf,
  isInScale,
  scaleRange,
  scaleSteps,
} from "./block-config";

/**
 * 에디터·리더·추출기·폴백·저장 라우트가 같은 `data-*`를 같은 뜻으로 읽는지.
 * 예전에는 에디터가 `parseInt(min) || 1`, 리더가 `parseInt(min || "1")`라
 * min 0인 척도가 화면마다 달랐습니다(코드 리뷰 3-P1-11, 4-P1-7).
 */
describe("scaleRange", () => {
  it("0은 유효한 끝값이다", () => {
    expect(scaleRange("0", "10")).toEqual({ min: 0, max: 10 });
  });

  it("비었거나 숫자가 아니면 그쪽 끝만 기본값", () => {
    expect(scaleRange("", "5")).toEqual({ min: 1, max: 5 });
    expect(scaleRange("3", "abc")).toEqual({ min: 3, max: 10 });
    expect(scaleRange(undefined, undefined)).toEqual(DEFAULT_SCALE_RANGE);
  });

  it("DB config의 숫자도 같은 규칙으로 읽는다", () => {
    expect(scaleRange(0, 4)).toEqual({ min: 0, max: 4 });
    expect(scaleRange(1.5, 4)).toEqual({ min: 1, max: 4 });
  });

  it("뒤집혔거나 터무니없으면 기본 범위", () => {
    expect(scaleRange("9", "2")).toEqual(DEFAULT_SCALE_RANGE);
    expect(scaleRange("1", "1e9")).toEqual(DEFAULT_SCALE_RANGE);
  });

  it("칸이 너무 많으면 잘라서 화면이 멈추지 않게 한다", () => {
    const range = scaleRange("1", "100000");
    expect(range).toEqual(DEFAULT_SCALE_RANGE);
    const wide = scaleRange("0", "500");
    expect(scaleSteps(wide)).toHaveLength(MAX_SCALE_STEPS);
  });

  it("범위 안의 정수만 칸이다", () => {
    const range = { min: 1, max: 5 };
    expect(isInScale(3, range)).toBe(true);
    expect(isInScale(3.5, range)).toBe(false);
    expect(isInScale(6, range)).toBe(false);
  });
});

describe("calloutTypeOf", () => {
  it("아는 종류는 그대로, 비었거나 모르면 note", () => {
    expect(calloutTypeOf("warning")).toBe("warning");
    expect(calloutTypeOf("")).toBe("note");
    expect(calloutTypeOf(null)).toBe("note");
    expect(calloutTypeOf("danger")).toBe("note");
  });

  it("프로토타입 키를 종류로 받지 않는다", () => {
    // `raw in TABLE`이면 constructor·toString이 통과했습니다(4-P1-8).
    expect(calloutTypeOf("constructor")).toBe("note");
    expect(calloutTypeOf("toString")).toBe("note");
    expect(calloutTypeOf("__proto__")).toBe("note");
  });
});
