/**
 * PostgREST는 한 번에 `max_rows`(기본 1000)까지만 돌려줍니다. 범위를 주지
 * 않고 읽으면 그 수에서 조용히 잘려, 답이 많은 독자의 진행률이나 판매가
 * 많은 저자의 매출이 덜 세어졌습니다(코드 리뷰 3-P1-3, 4-P1-26, 7-P1-2).
 */
export const READ_PAGE_SIZE = 1000;

type PageError = { message: string; code?: string };

type PageResult<T> = PromiseLike<{
  data: T[] | null;
  error: PageError | null;
}>;

export type ReadAllResult<T> =
  | { data: T[]; error: null }
  | { data: null; error: PageError };

/**
 * `page(from, to)`가 만든 쿼리를 1000건씩 끝까지 읽습니다.
 *
 * 쿼리에는 유일한 키로 `.order()`를 걸어 주세요(보통 `id`). 순서가 고정되지
 * 않으면 페이지 사이에서 행이 빠지거나 겹칩니다.
 *
 * 한 페이지라도 실패하면 읽은 데까지 돌려주지 않고 실패로 끝냅니다. 반쪽
 * 결과는 "덜 센 값"이 정상인 척 나가는 것과 같습니다.
 */
export async function readAllRows<T>(
  page: (from: number, to: number) => PageResult<T>,
): Promise<ReadAllResult<T>> {
  const rows: T[] = [];

  for (let from = 0; ; from += READ_PAGE_SIZE) {
    const { data, error } = await page(from, from + READ_PAGE_SIZE - 1);
    if (error) return { data: null, error };

    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < READ_PAGE_SIZE) return { data: rows, error: null };
  }
}
