import { describe, expect, it } from "vitest";
import {
  MAX_BIO_LENGTH,
  MAX_ORDER_INDEX,
  isBookPrice,
  isChapterStatus,
  isOrderIndex,
  joinLines,
  parseProfileUpdate,
  readBookTitle,
  readChapterTitle,
  readOptionalText,
  readVisibility,
  textLength,
} from "./authoring-input";

describe("한 줄 소개의 줄바꿈 (11-P0-1)", () => {
  it("줄바꿈과 그 앞뒤 공백을 공백 하나로 바꾼다", () => {
    expect(joinLines("마케터 \n\t 10년차")).toBe("마케터 10년차");
    expect(joinLines("a\r\n\r\nb\n \nc")).toBe("a b c");
    expect(joinLines("\n 앞뒤 \n")).toBe("앞뒤");
    expect(joinLines("줄바꿈  없음")).toBe("줄바꿈  없음");
  });

  it("줄바꿈 없는 긴 공백열도 바로 끝난다 — 예전 정규식은 O(N²)이었다", () => {
    const started = performance.now();
    const result = parseProfileUpdate({ bio: " ".repeat(200_000) + "x" });
    // 예전 정규식은 8만 자에 5초가 걸렸습니다. 넉넉히 잡아도 1초 안이어야 합니다.
    expect(performance.now() - started).toBeLessThan(1000);
    expect(result).toEqual({ ok: true, value: { bio: "x" } });
  });

  it("다듬은 뒤 상한을 넘으면 거절한다", () => {
    expect(parseProfileUpdate({ bio: "가".repeat(MAX_BIO_LENGTH) }).ok).toBe(true);
    expect(parseProfileUpdate({ bio: "가".repeat(MAX_BIO_LENGTH + 1) }).ok).toBe(false);
  });
});

describe("글자 수는 코드포인트로 센다 (11-P2-8)", () => {
  it("이모지는 한 글자다 — DB char_length와 같다", () => {
    expect(textLength("😀")).toBe(1);
    expect(textLength("가a😀")).toBe(3);
  });

  it("이모지가 섞여도 상한 안이면 받는다", () => {
    const bio = "😀".repeat(MAX_BIO_LENGTH);
    expect(bio.length).toBe(MAX_BIO_LENGTH * 2);
    expect(parseProfileUpdate({ bio })).toEqual({ ok: true, value: { bio } });
  });
});

describe("U+0000은 DB에 가기 전에 거절한다 (11-P2-5)", () => {
  it.each([
    ["책 제목", () => readBookTitle("a\u0000b")],
    ["장 제목", () => readChapterTitle("a\u0000b")],
    ["선택 글", () => readOptionalText("a\u0000b", 100, "글은")],
    ["이력", () => parseProfileUpdate({ about: "a\u0000b" })],
  ])("%s", (_label, read) => {
    expect(read().ok).toBe(false);
  });
});

describe("제목 상한 (11-P2-6)", () => {
  it("200자까지 받고 넘으면 거절한다", () => {
    expect(readBookTitle("가".repeat(200))).toEqual({ ok: true, value: "가".repeat(200) });
    expect(readBookTitle("가".repeat(201))).toEqual({
      ok: false,
      message: "제목은 200자까지 쓸 수 있어요.",
    });
    expect(readChapterTitle("가".repeat(201)).ok).toBe(false);
  });

  it("빈 제목은 각자의 문구로 거절한다", () => {
    expect(readBookTitle("  ")).toEqual({ ok: false, message: "책 제목을 입력해 주세요." });
    expect(readChapterTitle(null)).toEqual({ ok: false, message: "장 제목을 입력해 주세요." });
  });
});

describe("숫자 범위", () => {
  it("장 순서는 INTEGER 끝값까지 받지 않는다 — 다음 장의 +1이 넘친다 (11-P2-4)", () => {
    expect(isOrderIndex(MAX_ORDER_INDEX)).toBe(true);
    expect(isOrderIndex(MAX_ORDER_INDEX + 1)).toBe(false);
    expect(isOrderIndex(2_147_483_647)).toBe(false);
  });

  it("가격은 INTEGER 범위의 음이 아닌 정수", () => {
    expect(isBookPrice(2_147_483_647)).toBe(true);
    expect(isBookPrice(2_147_483_648)).toBe(false);
    expect(isBookPrice(-1)).toBe(false);
    expect(isBookPrice(1.5)).toBe(false);
  });

  it("장 상태는 목록 안의 값만", () => {
    expect(isChapterStatus("draft")).toBe(true);
    expect(isChapterStatus("PUBLISHED")).toBe(false);
  });
});

describe("공개 범위 (11-P2-10)", () => {
  it("공개·비공개는 언제나 고를 수 있다", () => {
    expect(readVisibility("public", "unlisted")).toEqual({ ok: true, value: "public" });
    expect(readVisibility("private", "public")).toEqual({ ok: true, value: "private" });
  });

  it("링크 공유는 지금 값 그대로일 때만 받는다", () => {
    expect(readVisibility("unlisted", "unlisted")).toEqual({ ok: true, value: "unlisted" });
    expect(readVisibility("unlisted", "private").ok).toBe(false);
  });

  it("모르는 값은 거절한다", () => {
    expect(readVisibility("everyone", "public").ok).toBe(false);
  });
});

describe("readOptionalText", () => {
  it("null과 공백뿐인 글은 null, 문자열이 아니면 거절", () => {
    expect(readOptionalText(null, 10, "글은")).toEqual({ ok: true, value: null });
    expect(readOptionalText("  ", 10, "글은")).toEqual({ ok: true, value: null });
    expect(readOptionalText(3, 10, "글은").ok).toBe(false);
  });

  it("상한 문구는 천 단위 쉼표를 쓴다", () => {
    expect(readOptionalText("가".repeat(2001), 2000, "소개글은")).toEqual({
      ok: false,
      message: "소개글은 2,000자까지 쓸 수 있어요.",
    });
  });
});
