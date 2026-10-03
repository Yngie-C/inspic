/**
 * 장·책 API가 받는 입력의 런타임 검증 (코드 리뷰 4-P1-11, 4-P1-17).
 *
 * 타입 선언만 믿으면 `{"title":null}`이 문자열 `'null'`로, `{"title":"   "}`이
 * 빈 제목으로 저장되고, 타입이 어긋난 값은 Postgres 원문이 담긴 500이 됩니다.
 * DB에 가기 전에 여기서 거절합니다.
 */

export const INVALID_BODY_MESSAGE = "요청 형식이 올바르지 않아요.";

export type InputResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export const CHAPTER_STATUSES = ["draft", "published"] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export function isChapterStatus(value: unknown): value is ChapterStatus {
  return (CHAPTER_STATUSES as readonly unknown[]).includes(value);
}

/** 장 제목. 앞뒤 공백을 걷고, 비었으면 거절합니다. */
export function readChapterTitle(value: unknown): InputResult<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: "장 제목을 입력해 주세요." };
  }
  return { ok: true, value: value.trim() };
}

/** 책 제목. 비우면 공개된 책이 제목 없이 나갑니다(4-P1-17). */
export function readBookTitle(value: unknown): InputResult<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: "책 제목을 입력해 주세요." };
  }
  return { ok: true, value: value.trim() };
}

/**
 * 장 순서. 음이 아닌 정수만. 서버가 새 장을 맨 뒤에 두므로 순서를
 * 바꾸는 요청에서만 옵니다.
 */
export function isOrderIndex(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 2_147_483_647
  );
}

/** 설정 폼이 고를 수 있는 책 언어. */
export const BOOK_LANGUAGES = ["ko", "en", "ja", "zh"] as const;

/**
 * 저자가 PUT으로 고를 수 있는 책 상태. `processing`은 업로드 처리 중에
 * 서버가 쓰는 값이라 받지 않습니다.
 */
export const EDITABLE_BOOK_STATUSES = ["draft", "published", "archived"] as const;

export const BOOK_VISIBILITIES = ["private", "unlisted", "public"] as const;

export function isOneOf<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return (list as readonly unknown[]).includes(value);
}
