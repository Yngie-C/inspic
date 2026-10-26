// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizeContent } from "./sanitize";

/**
 * 서버(장 라우트·업로드)에서는 isomorphic-dompurify가 jsdom window로 돕니다.
 * 브라우저 경로(`sanitize.test.ts`)와 결과가 같아야 저장본과 렌더본이 갈라지지
 * 않습니다.
 */
describe("sanitizeContent — 서버 경로", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("입력란·class·외부 이미지를 지우고 업로드 서식은 남긴다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const ours = "https://project.supabase.co/storage/v1/object/public/chapter-images/b/c/a.png";

    expect(
      sanitizeContent(
        `<div class="fixed inset-0"><input type="checkbox" checked><textarea>x</textarea>` +
          `<img src="https://tracker.example/p.gif" alt="그림"><img src="${ours}" alt="">` +
          `<del>옛</del> CO<sub>2</sub></div>`,
      ),
    ).toBe(`<div>[x]x그림<img src="${ours}" alt=""><del>옛</del> CO<sub>2</sub></div>`);
  });
});
