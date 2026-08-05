import type { WorkbookAnswer } from "./types";

/**
 * 독자 응답의 브라우저 캐시.
 *
 * **진실의 원천은 DB(`workbook_responses`)입니다.** 이 캐시가 하는 일은
 * 둘뿐입니다.
 *
 * 1. 네트워크가 끊겼거나 저장이 실패했을 때 방금 쓴 내용을 잃지 않기
 * 2. 다시 열었을 때 서버 응답이 오기 전에 먼저 그려 주기
 *
 * 그래서 서버에서 값이 오면 그쪽이 이깁니다. 이 캐시로 서버 값을 덮지
 * 마세요 — 다른 기기에서 쓴 최신 응답이 옛 기기의 캐시로 되돌아갑니다.
 *
 * 키 구조는 DB와 같습니다: 책 안에서 (block_id, field_key). 챕터는 들어가지
 * 않습니다. 크리에이터가 블록을 다른 챕터로 옮겨도 응답은 따라가야 하고,
 * 응답의 정체성에 챕터가 들어가면 그때 캐시가 어긋납니다.
 */

const PREFIX = "inspic_workbook";

/** 한 블록의 응답. 키는 field_key. */
export type BlockAnswers = Record<string, WorkbookAnswer>;

/** 책 한 권의 응답 전부. 키는 block_id. */
export type BookAnswers = Record<string, BlockAnswers>;

function cacheKey(bookId: string): string {
  return `${PREFIX}:${bookId}`;
}

export function readResponseCache(bookId: string): BookAnswers {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(cacheKey(bookId));
    if (!raw) return {};
    return sanitizeCache(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function writeResponseCache(bookId: string, answers: BookAnswers): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(cacheKey(bookId), JSON.stringify(answers));
  } catch {
    // quota exceeded — 캐시일 뿐이므로 조용히 넘어갑니다. 저장은 서버가
    // 맡고, 실패하면 리더가 저장 상태로 알립니다.
  }
}

export function clearResponseCache(bookId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(cacheKey(bookId));
}

/**
 * 캐시는 사용자가 고칠 수 있는 저장소입니다. 모양이 어긋난 값을 그대로
 * 화면에 넣으면 리더가 터지므로, 읽을 때 걸러 냅니다.
 */
function sanitizeCache(parsed: unknown): BookAnswers {
  if (!isPlainObject(parsed)) return {};

  const clean: BookAnswers = {};

  for (const [blockId, block] of Object.entries(parsed)) {
    if (!isPlainObject(block)) continue;

    const fields: BlockAnswers = {};
    for (const [fieldKey, value] of Object.entries(block)) {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
      ) {
        fields[fieldKey] = value;
      }
    }

    if (Object.keys(fields).length > 0) clean[blockId] = fields;
  }

  return clean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
