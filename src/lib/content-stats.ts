/**
 * 챕터 본문 통계.
 *
 * 챕터를 쓰는 경로(업로드·생성·수정)가 모두 같은 값을 내야
 * `books.total_words`가 어긋나지 않습니다.
 */

/**
 * `chapters.content_html`의 CHECK 제약(`length(content_html) <= 500000`)과
 * 같은 값입니다. DB에 닿기 전에 이 값으로 먼저 거절해야 크리에이터에게
 * 이유를 알려 줄 수 있습니다 — 제약에 걸리면 Postgres 원문이 담긴 500이
 * 돌아오고 화면은 원인을 모릅니다.
 */
export const MAX_CHAPTER_HTML_LENGTH = 500_000;

/**
 * Postgres `length()`와 같은 방식(코드 포인트 수)으로 셉니다.
 * `String.length`는 UTF-16 단위라 이모지 같은 문자를 두 번 셉니다.
 */
export function chapterHtmlLength(html: string): number {
  let count = 0;
  for (let i = 0; i < html.length; i++) {
    const code = html.charCodeAt(i);
    // 서로게이트 쌍의 뒷부분은 앞부분과 한 글자입니다.
    if (code >= 0xdc00 && code <= 0xdfff && i > 0) {
      const prev = html.charCodeAt(i - 1);
      if (prev >= 0xd800 && prev <= 0xdbff) continue;
    }
    count++;
  }
  return count;
}

export function isChapterHtmlTooLong(html: string): boolean {
  // 코드 포인트 수는 UTF-16 길이보다 클 수 없으니, 짧으면 셀 필요가 없습니다.
  if (html.length <= MAX_CHAPTER_HTML_LENGTH) return false;
  return chapterHtmlLength(html) > MAX_CHAPTER_HTML_LENGTH;
}

/** 크리에이터에게 보여 줄 거절 사유. 에디터가 그대로 띄웁니다. */
export const CHAPTER_TOO_LONG_MESSAGE =
  "본문이 너무 길어 저장하지 못했어요. 붙여 넣은 이미지가 있다면 지우고 이미지 버튼으로 다시 올리거나, 장을 나눠 주세요.";

/** HTML에서 태그를 걷어낸 뒤 공백으로 나눈 단어 수. */
export function countWords(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}
