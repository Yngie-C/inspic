import { describe, expect, it } from "vitest";
import {
  MAX_CHAPTER_HTML_LENGTH,
  chapterHtmlLength,
  isChapterHtmlTooLong,
} from "./content-stats";

/**
 * 챕터 본문 길이는 DB CHECK 제약(`length(content_html) <= 500000`)과 같은
 * 기준으로 세야 합니다. 더 느슨하면 DB가 원문 에러로 거절하고, 더 빡빡하면
 * 저장할 수 있는 글을 막습니다.
 */
describe("챕터 본문 길이", () => {
  it("한도까지는 통과, 한 글자 넘으면 거절", () => {
    expect(isChapterHtmlTooLong("가".repeat(MAX_CHAPTER_HTML_LENGTH))).toBe(false);
    expect(isChapterHtmlTooLong("가".repeat(MAX_CHAPTER_HTML_LENGTH + 1))).toBe(true);
  });

  it("이모지는 Postgres length()처럼 한 글자로 센다", () => {
    expect(chapterHtmlLength("😀")).toBe(1);
    expect(chapterHtmlLength("a😀b")).toBe(3);

    // UTF-16 길이로는 한도를 넘지만 코드 포인트로는 한도 안이다.
    const emojis = "😀".repeat(MAX_CHAPTER_HTML_LENGTH);
    expect(emojis.length).toBeGreaterThan(MAX_CHAPTER_HTML_LENGTH);
    expect(isChapterHtmlTooLong(emojis)).toBe(false);
  });

  it("짝 없는 서로게이트도 한 글자로 센다", () => {
    expect(chapterHtmlLength("\udc00")).toBe(1);
    expect(chapterHtmlLength("\ud800")).toBe(1);
    expect(chapterHtmlLength("\udc00\ud800")).toBe(2);
  });
});
