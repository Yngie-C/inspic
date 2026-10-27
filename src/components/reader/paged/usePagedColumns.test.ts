import { describe, expect, it } from "vitest";
import { firstStartingOn } from "./usePagedColumns";

describe("쪽의 기준 요소", () => {
  const pageOf = (page: number) => page;

  it("그 쪽에서 시작하는 첫 요소를 고른다", () => {
    expect(firstStartingOn([0, 0, 1, 1, 2], pageOf, 1)).toBe(1);
  });

  it("앞 쪽에서 시작한 문단이 쪽 전체를 차지하면 null이다", () => {
    // 3쪽에서 시작한 긴 목록이 4쪽까지 차지하고 다음 요소가 5쪽에서 시작.
    // 5쪽 요소를 기준으로 삼으면 다시 잴 때 5쪽으로 건너뛴다(9-P1-6).
    expect(firstStartingOn([0, 3, 5], pageOf, 4)).toBeNull();
  });

  it("마지막 요소 뒤의 쪽이면 null이다", () => {
    expect(firstStartingOn([0, 1], pageOf, 2)).toBeNull();
  });
});
