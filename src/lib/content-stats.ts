/**
 * 챕터 본문 통계.
 *
 * 챕터를 쓰는 경로(업로드·생성·수정)가 모두 같은 값을 내야
 * `books.total_words`가 어긋나지 않습니다.
 */

/** HTML에서 태그를 걷어낸 뒤 공백으로 나눈 단어 수. */
export function countWords(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}
