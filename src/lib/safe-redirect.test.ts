import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-redirect";

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
  ])("브라우저가 외부 주소로 읽는 값은 거른다 — %s", (_, raw) => {
    expect(safeInternalPath(raw, "/creator")).toBe("/creator");
  });

  it("쿼리에서 디코딩된 값도 같은 규칙으로 거른다", () => {
    const decoded = new URLSearchParams("redirect=/%5Cevil.com").get("redirect");
    expect(safeInternalPath(decoded, "/creator")).toBe("/creator");
    const tab = new URLSearchParams("redirect=/%09/evil.com").get("redirect");
    expect(safeInternalPath(tab, "/creator")).toBe("/creator");
  });
});
