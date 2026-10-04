// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { exportContentDisposition, exportFilename } from "./export-source";

/**
 * 내려받기 헤더. 헤더 값에는 코드 255를 넘는 문자가 들어갈 수 없어서,
 * 한글 이름을 `filename="..."`에 그대로 넣으면 응답을 만드는 순간 던지고
 * 한글 제목 책은 전부 500이 됐습니다.
 */
describe("exportContentDisposition", () => {
  it("한글 제목으로 응답을 만들 수 있다", () => {
    const filename = exportFilename("나를 찾는 워크북", "pdf");

    expect(
      () =>
        new Response("x", {
          headers: { "Content-Disposition": exportContentDisposition(filename) },
        }),
    ).not.toThrow();
  });

  it("한글 이름은 filename*로 싣는다", () => {
    const header = exportContentDisposition(exportFilename("나를 찾는 워크북", "pdf"));

    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent("나를_찾는_워크북.pdf")}`);
    expect(header).toContain('filename="book.pdf"');
  });

  it("ASCII가 섞인 이름은 그 부분을 남긴다", () => {
    const header = exportContentDisposition(exportFilename("OKR 워크북 2026", "epub"));

    expect(header).toContain('filename="OKR__2026.epub"');
  });
});
