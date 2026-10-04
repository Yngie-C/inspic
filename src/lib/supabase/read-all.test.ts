import { describe, expect, it } from "vitest";
import { READ_PAGE_SIZE, readAllRows } from "./read-all";

/** `total`개의 행을 `from..to` 범위로 잘라 주는 가짜 쿼리. 범위를 기록합니다. */
function fakeTable(total: number, failAt?: number) {
  const ranges: [number, number][] = [];
  const page = (from: number, to: number) => {
    ranges.push([from, to]);
    if (failAt === from) {
      return Promise.resolve({ data: null, error: { message: "timeout" } });
    }
    const rows = Array.from(
      { length: Math.max(0, Math.min(to, total - 1) - from + 1) },
      (_, i) => from + i,
    );
    return Promise.resolve({ data: rows, error: null });
  };
  return { page, ranges };
}

describe("readAllRows", () => {
  it("1000건을 넘으면 끝까지 읽는다", async () => {
    const table = fakeTable(2500);

    const result = await readAllRows(table.page);

    expect(result.data).toHaveLength(2500);
    expect(table.ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("정확히 1000건이면 한 번 더 읽어 끝을 확인한다", async () => {
    const table = fakeTable(READ_PAGE_SIZE);

    const result = await readAllRows(table.page);

    expect(result.data).toHaveLength(READ_PAGE_SIZE);
    expect(table.ranges).toHaveLength(2);
  });

  it("빈 결과는 빈 배열", async () => {
    const result = await readAllRows(fakeTable(0).page);

    expect(result).toEqual({ data: [], error: null });
  });

  it("중간 페이지가 실패하면 읽은 데까지 돌려주지 않는다", async () => {
    const result = await readAllRows(fakeTable(2500, 1000).page);

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("timeout");
  });
});
