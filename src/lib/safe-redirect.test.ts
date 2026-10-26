import { describe, expect, it } from "vitest";
import { readRedirectParam, safeInternalPath } from "./safe-redirect";

describe("safeInternalPath", () => {
  it("같은 사이트 안의 경로는 쿼리·해시까지 그대로 통과시킨다", () => {
    expect(safeInternalPath("/reader/abc", "/creator")).toBe("/reader/abc");
    expect(safeInternalPath("/creator?tab=sales#top", "/x")).toBe("/creator?tab=sales#top");
    expect(safeInternalPath("/auth/reset-password", "/")).toBe("/auth/reset-password");
  });

  it("값이 없거나 `/`로 시작하지 않으면 기본값을 쓴다", () => {
    expect(safeInternalPath(null, "/creator")).toBe("/creator");
    expect(safeInternalPath("", "/creator")).toBe("/creator");
    expect(safeInternalPath("creator", "/x")).toBe("/x");
    expect(safeInternalPath("https://evil.com", "/x")).toBe("/x");
    expect(safeInternalPath(" //evil.com", "/x")).toBe("/x");
  });

  it.each([
    ["프로토콜 상대 URL", "//evil.com"],
    ["역슬래시", "/\\evil.com"],
    ["역슬래시 둘", "/\\\\evil.com"],
    ["탭", "/\t/evil.com"],
    ["줄바꿈", "/\n/evil.com"],
    ["슬래시 셋", "///evil.com"],
    // 점 구간을 정리하면 `//evil.com`이 되는 값 (코드 리뷰 13-P0-1)
    ["상위 경로 뒤 슬래시 둘", "/..//evil.com"],
    ["현재 경로 뒤 슬래시 둘", "/.//evil.com"],
    ["인코딩한 상위 경로", "/%2e%2e//evil.com"],
    ["상위 경로 뒤 역슬래시", "/..\\/evil.com"],
    ["경로 중간의 상위 경로", "/a/../..//evil.com"],
  ])("브라우저가 외부 주소로 읽는 값은 거른다 — %s", (_, raw) => {
    expect(safeInternalPath(raw, "/creator")).toBe("/creator");
  });

  it("점 구간은 정리한 결과로 통과시킨다", () => {
    expect(safeInternalPath("/a/../reader/x", "/x")).toBe("/reader/x");
    expect(safeInternalPath("/./creator", "/x")).toBe("/creator");
  });

  it("쿼리에서 디코딩된 값도 같은 규칙으로 거른다", () => {
    const decoded = new URLSearchParams("redirect=/%5Cevil.com").get("redirect");
    expect(safeInternalPath(decoded, "/creator")).toBe("/creator");
    const tab = new URLSearchParams("redirect=/%09/evil.com").get("redirect");
    expect(safeInternalPath(tab, "/creator")).toBe("/creator");
    const dots = new URLSearchParams("redirect=/..//evil.com").get("redirect");
    expect(safeInternalPath(dots, "/creator")).toBe("/creator");
  });
});

describe("readRedirectParam", () => {
  it("검사를 통과한 경로만 돌려주고 나머지는 null", () => {
    expect(readRedirectParam("/reader/abc")).toBe("/reader/abc");
    expect(readRedirectParam("/..//evil.com")).toBeNull();
    expect(readRedirectParam("https://evil.com")).toBeNull();
    expect(readRedirectParam(undefined)).toBeNull();
    expect(readRedirectParam(["/reader/a", "/reader/b"])).toBeNull();
  });
});
