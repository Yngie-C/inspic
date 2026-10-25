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

/** `books.description`(소개글) 상한. 대체 글과 같은 값입니다(코드 리뷰 11-P2-7). */
export const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * 책·장 제목 상한. 제목은 목록·PDF 표지·EPUB 목차·내려받기 파일 이름까지
 * 퍼지므로 상한 없이 받으면 1MB 제목이 그 전부를 부풀립니다(11-P2-6).
 */
export const MAX_BOOK_TITLE_LENGTH = 200;
export const MAX_CHAPTER_TITLE_LENGTH = 200;

/**
 * 장 순서 상한. INTEGER 끝값까지 받으면 새 장을 맨 뒤에 붙이는 `+1`이
 * 범위를 넘어 그 책에 장을 더 못 더합니다(11-P2-4).
 */
export const MAX_ORDER_INDEX = 1_000_000;

const INT32_MAX = 2_147_483_647;

export type InputResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export const CHAPTER_STATUSES = ["draft", "published"] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export function isChapterStatus(value: unknown): value is ChapterStatus {
  return isOneOf(CHAPTER_STATUSES, value);
}

/**
 * 글자 수. DB CHECK의 `char_length`와 같게 코드포인트로 셉니다 — `.length`
 * (UTF-16)로 세면 이모지가 두 글자가 되어 DB가 받을 글을 먼저 거절합니다.
 */
export function textLength(value: string): number {
  return [...value].length;
}

/** Postgres TEXT는 U+0000을 받지 않습니다. 그대로 보내면 400이 아니라 500입니다. */
function hasNul(value: string): boolean {
  return value.includes("\u0000");
}

/** 제목. 앞뒤 공백을 걷고, 비었으면 `emptyMessage`로 거절합니다. */
function readRequiredTitle(
  value: unknown,
  max: number,
  emptyMessage: string,
): InputResult<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, message: emptyMessage };
  }
  if (hasNul(value)) return { ok: false, message: INVALID_BODY_MESSAGE };
  const trimmed = value.trim();
  if (textLength(trimmed) > max) {
    return { ok: false, message: `제목은 ${max.toLocaleString()}자까지 쓸 수 있어요.` };
  }
  return { ok: true, value: trimmed };
}

/** 장 제목. 앞뒤 공백을 걷고, 비었으면 거절합니다. */
export function readChapterTitle(value: unknown): InputResult<string> {
  return readRequiredTitle(value, MAX_CHAPTER_TITLE_LENGTH, "장 제목을 입력해 주세요.");
}

/** 책 제목. 비우면 공개된 책이 제목 없이 나갑니다(4-P1-17). */
export function readBookTitle(value: unknown): InputResult<string> {
  return readRequiredTitle(value, MAX_BOOK_TITLE_LENGTH, "책 제목을 입력해 주세요.");
}

function isIntInRange(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

/**
 * 장 순서. 음이 아닌 정수만. 서버가 새 장을 맨 뒤에 두므로 순서를
 * 바꾸는 요청에서만 옵니다.
 */
export function isOrderIndex(value: unknown): value is number {
  return isIntInRange(value, MAX_ORDER_INDEX);
}

/** 책 가격(원). 0은 무료. `books.price`가 INTEGER라 그 범위의 정수만 받습니다. */
export function isBookPrice(value: unknown): value is number {
  return isIntInRange(value, INT32_MAX);
}

/** 설정 폼이 고를 수 있는 책 언어. */
export const BOOK_LANGUAGES = ["ko", "en", "ja", "zh"] as const;

/**
 * 저자가 PUT으로 고를 수 있는 책 상태. `processing`은 업로드 처리 중에
 * 서버가 쓰는 값이라 받지 않습니다.
 */
export const EDITABLE_BOOK_STATUSES = ["draft", "published", "archived"] as const;

/**
 * DB에 있을 수 있는 공개 범위. `unlisted`(링크 공유)는 열어 주는 경로가
 * 없어 새로 고를 수 없고, 이미 그 값인 책만 그대로 둡니다 — 판정은
 * `readVisibility()`가 합니다.
 */
export const BOOK_VISIBILITIES = ["private", "unlisted", "public"] as const;
export type BookVisibility = (typeof BOOK_VISIBILITIES)[number];

/** 저자가 새로 고를 수 있는 공개 범위. */
export const SELECTABLE_BOOK_VISIBILITIES = ["private", "public"] as const;

/**
 * 책 PUT의 `visibility`. 고를 수 있는 값이거나, 지금 값 그대로인 `unlisted`만
 * 받습니다 — 설정 폼은 제목만 고쳐도 현재 visibility를 함께 보내므로, 그대로인
 * 값까지 막으면 그 책은 아무것도 저장하지 못합니다.
 */
export function readVisibility(
  value: unknown,
  current: string | null | undefined,
): InputResult<BookVisibility> {
  if (isOneOf(SELECTABLE_BOOK_VISIBILITIES, value)) return { ok: true, value };
  if (value === "unlisted") {
    return current === "unlisted"
      ? { ok: true, value }
      : {
          ok: false,
          message: "링크 공유는 더 이상 고를 수 없어요. 공개나 비공개를 골라 주세요.",
        };
  }
  return { ok: false, message: INVALID_BODY_MESSAGE };
}

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
 * DB에도 같은 CHECK가 `NOT VALID`로 있습니다(00015) — 예전에 쓴 긴 소개는
 * 남지만, 그 행을 고치는 UPDATE는 다른 필드만 바꿔도 행 전체를 검사해
 * 거절됩니다. 프로필 라우트가 그 거절을 "줄여 주세요"로 안내합니다.
 */
export const MAX_BIO_LENGTH = 80;

/** 긴 이력(`user_profiles.about`) 상한. 00014의 CHECK와 같은 값입니다. */
export const MAX_ABOUT_LENGTH = 2000;

export interface ProfileUpdate {
  display_name?: string | null;
  bio?: string | null;
  about?: string | null;
}

/**
 * 문자열이나 null만. 앞뒤 공백을 걷고, 비면 null입니다. 공백뿐인 소개글이
 * 저장되면 출간 검수의 "소개글 없음" 경고가 빠집니다.
 */
export function readOptionalText(
  value: unknown,
  max: number,
  label: string,
): InputResult<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string" || hasNul(value)) {
    return { ok: false, message: INVALID_BODY_MESSAGE };
  }
  const trimmed = value.trim();
  if (textLength(trimmed) > max) {
    return { ok: false, message: `${label} ${max.toLocaleString()}자까지 쓸 수 있어요.` };
  }
  return { ok: true, value: trimmed || null };
}

/**
 * 한 줄로 그리는 자리의 줄바꿈을 공백 하나로 바꿉니다. 줄바꿈 앞뒤 공백도
 * 함께 걷습니다.
 *
 * 예전 정규식(`\s*` + 줄바꿈 + `\s*`)은 줄바꿈 없는 공백열에서 시작 위치마다
 * 끝까지 되짚어 O(N²)이었습니다 — 공백 8만 자에 5초, 길이 검사보다 먼저 돌아
 * 요청 하나로 서버가 멈췄습니다(11-P0-1). 나눠서 다듬으면 선형입니다.
 */
export function joinLines(value: string): string {
  return value
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ");
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
    const raw = typeof body.bio === "string" ? joinLines(body.bio) : body.bio;
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
