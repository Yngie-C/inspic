import { describe, expect, it } from "vitest";
import { ilikeAnyFilter } from "./postgrest-filter";

describe("ilikeAnyFilter", () => {
  it("열마다 큰따옴표로 감싼 ilike 조건을 쉼표로 잇는다", () => {
    expect(ilikeAnyFilter(["title", "description"], "습관")).toBe(
      'title.ilike."%습관%",description.ilike."%습관%"',
    );
  });

  it("쉼표·괄호·점은 따옴표 안에 남아 조건을 덧붙이지 못한다", () => {
    const filter = ilikeAnyFilter(["title"], "x%,status.eq.draft),(a.b");

    // 따옴표 밖에는 열 이름과 연산자뿐이다.
    expect(filter.startsWith('title.ilike."')).toBe(true);
    expect(filter.endsWith('"')).toBe(true);
    expect(filter.slice('title.ilike."'.length, -1)).not.toMatch(/(^|[^\\])"/);
  });

  it("LIKE 와일드카드 %·_는 글자 그대로 찾는다", () => {
    // 패턴 `%100\%%` → PostgREST 값 이스케이프로 `\`가 한 번 더 붙는다.
    expect(ilikeAnyFilter(["title"], "100%")).toBe('title.ilike."%100\\\\%%"');
    expect(ilikeAnyFilter(["title"], "a_b")).toBe('title.ilike."%a\\\\_b%"');
  });

  it("큰따옴표와 역슬래시를 이스케이프한다", () => {
    expect(ilikeAnyFilter(["title"], 'say "hi"')).toBe('title.ilike."%say \\"hi\\"%"');
    expect(ilikeAnyFilter(["title"], "a\\b")).toBe('title.ilike."%a\\\\\\\\b%"');
  });
});
