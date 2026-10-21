/**
 * 장·책·프로필 API가 받는 입력의 런타임 검증 (코드 리뷰 4-P1-11, 4-P1-17).
 *
 * 타입 선언만 믿으면 `{"title":null}`이 문자열 `'null'`로, `{"title":"   "}`이
 * 빈 제목으로 저장되고, 타입이 어긋난 값은 Postgres 원문이 담긴 500이 됩니다.
 * DB에 가기 전에 여기서 거절합니다.
 */

export const INVALID_BODY_MESSAGE = "요청 형식이 올바르지 않아요.";

/** `books.audience`("이런 분께") 상한. 00012의 CHECK와 같은 값입니다. */
export const MAX_AUDIENCE_LENGTH = 1000;

/** `books.detail_image_alt`(소개 이미지 대체 글) 상한. 00013의 CHECK와 같은 값입니다. */
export const MAX_DETAIL_IMAGE_ALT_LENGTH = 2000;

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

/** 책 가격(원). 0은 무료. `books.price`가 INTEGER라 그 범위의 정수만 받습니다. */
export function isBookPrice(value: unknown): value is number {
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

/** 저자 이름 상한. */
export const MAX_DISPLAY_NAME_LENGTH = 40;

/**
 * 한 줄 소개(`user_profiles.bio`) 상한. 랜딩·탐색 카드가 한 줄로 자릅니다.
 * DB CHECK는 없습니다 — 이전에 쓴 긴 소개가 남아 있을 수 있습니다(00014).
 */
export const MAX_BIO_LENGTH = 80;

/** 긴 이력(`user_profiles.about`) 상한. 00014의 CHECK와 같은 값입니다. */
export const MAX_ABOUT_LENGTH = 2000;

export interface ProfileUpdate {
  display_name?: string | null;
  bio?: string | null;
  about?: string | null;
}

/** 문자열이나 null만. 앞뒤 공백을 걷고, 비면 null입니다. */
function readOptionalText(
  value: unknown,
  max: number,
  label: string,
): InputResult<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, message: INVALID_BODY_MESSAGE };
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { ok: false, message: `${label} ${max}자까지 쓸 수 있어요.` };
  }
  return { ok: true, value: trimmed || null };
}

/**
 * `PUT /api/my/profile` 본문. 보낸 필드만 바꿉니다.
 *
 * `avatar_url`은 받지 않습니다 — 사진은 `/api/my/avatar` 업로드로만 바꿉니다.
 * 여기서 받으면 아무 URL이나 저자 페이지에 걸리고, 옛 파일도 정리되지 않습니다.
 */
export function parseProfileUpdate(body: Record<string, unknown>): InputResult<ProfileUpdate> {
  if ("avatar_url" in body) {
    return { ok: false, message: "프로필 사진은 사진 올리기로 바꿔 주세요." };
  }

  const update: ProfileUpdate = {};

  if ("display_name" in body) {
    const name = readOptionalText(body.display_name, MAX_DISPLAY_NAME_LENGTH, "이름은");
    if (!name.ok) return name;
    update.display_name = name.value;
  }

  if ("bio" in body) {
    // 한 줄로 그리는 자리라 줄바꿈은 공백으로 바꿉니다.
    const raw = typeof body.bio === "string" ? body.bio.replace(/\s*[\r\n]+\s*/g, " ") : body.bio;
    const bio = readOptionalText(raw, MAX_BIO_LENGTH, "한 줄 소개는");
    if (!bio.ok) return bio;
    update.bio = bio.value;
  }

  if ("about" in body) {
    const about = readOptionalText(body.about, MAX_ABOUT_LENGTH, "이력은");
    if (!about.ok) return about;
    update.about = about.value;
  }

  return { ok: true, value: update };
}
