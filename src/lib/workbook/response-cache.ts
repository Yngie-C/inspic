import type { LoadedResponse } from "./response-client";
import type { ResponseWrite } from "./response-payload";
import { answerFromResponse, responseKey } from "./responses";
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
 *
 * **보는 사람마다 칸이 다릅니다.** 무료 책과 유료 책 첫 챕터는 비로그인도
 * 읽으므로, 한 기기에서 익명 → 로그인 순으로 같은 책을 열게 됩니다. 칸을
 * 나누지 않으면 익명일 때 쓴 답이 로그인 화면에 그대로 뜨는데, 그 값은
 * 서버에 보낼 큐에는 없습니다 — 저장된 것처럼 보이지만 아무 데도
 * 저장되지 않은 상태이고, 이 화면에서 가장 나쁜 실패입니다.
 */

const PREFIX = "inspic_workbook";

/** 한 블록의 응답. 키는 field_key. */
export type BlockAnswers = Record<string, WorkbookAnswer>;

/** 책 한 권의 응답 전부. 키는 block_id. */
export type BookAnswers = Record<string, BlockAnswers>;

/**
 * 아직 서버가 받았다고 확인하지 않은 답. block_id → field_key → 쓴 시각(ms).
 *
 * 화면과 캐시에는 값이 있는데 서버에는 없는 상태 — 저장 실패 뒤 새로고침,
 * 미리보기에서 쓰고 나중에 구매, 탭을 닫는 중 끊긴 요청 — 가 정상
 * 경로입니다. 표시가 없으면 다시 열었을 때 그 답을 보낼 근거가 없어서,
 * 화면에는 보이는데 영영 저장되지 않았습니다(코드 리뷰 3-P0-4).
 *
 * 쓴 시각은 서버 값과 겨룰 때 씁니다. 서버 행의 `written_at`(그 답을 쓴
 * 시각)이 더 늦으면 다른 기기에서 쓴 최신 답이므로 서버가 이깁니다.
 */
export type UnsentMarks = Record<string, Record<string, number>>;

export interface ResponseCache {
  answers: BookAnswers;
  unsent: UnsentMarks;
  /**
   * 서버가 받지 않겠다고 답한 것(`rejected`, 4xx). 모양은 `unsent`와 같고,
   * 한 답은 둘 중 한 곳에만 있습니다.
   *
   * 값은 버리지 않습니다 — 저자가 블록을 고치는 중이라 정의가 잠깐 없을 수
   * 있고, 그 사이 독자가 쓴 글이 사라지면 안 됩니다. 다만 다시 열 때마다
   * 저절로 보내지는 않습니다. 정의가 아예 지워진 문항이면 화면에 그 블록이
   * 없는데 매번 거절돼 "저장 실패"만 뜹니다. 독자가 그 블록을 다시 고치거나
   * "다시 시도"를 누를 때 보냅니다.
   */
  rejected: UnsentMarks;
}

const CACHE_VERSION = 2;

/** 비로그인 방문자의 칸. 로그인 사용자의 칸과 절대 섞이지 않습니다. */
const ANONYMOUS = "anon";

function cacheKey(bookId: string, viewerId: string | null): string {
  return `${PREFIX}:${viewerId ?? ANONYMOUS}:${bookId}`;
}

export function readResponseCache(
  bookId: string,
  viewerId: string | null,
): ResponseCache {
  if (typeof window === "undefined") return emptyCache();

  try {
    const raw = localStorage.getItem(cacheKey(bookId, viewerId));
    if (!raw) return emptyCache();
    return sanitizeCache(JSON.parse(raw));
  } catch {
    return emptyCache();
  }
}

export function writeResponseCache(
  bookId: string,
  viewerId: string | null,
  cache: ResponseCache,
): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      cacheKey(bookId, viewerId),
      JSON.stringify({ v: CACHE_VERSION, ...cache }),
    );
  } catch {
    // quota exceeded — 캐시일 뿐이므로 조용히 넘어갑니다. 저장은 서버가
    // 맡고, 실패하면 리더가 저장 상태로 알립니다.
  }
}

function emptyCache(): ResponseCache {
  return { answers: {}, unsent: {}, rejected: {} };
}

/**
 * 캐시는 사용자가 고칠 수 있는 저장소입니다. 모양이 어긋난 값을 그대로
 * 화면에 넣으면 리더가 터지므로, 읽을 때 걸러 냅니다.
 *
 * 버전 표시가 없는 예전 캐시(값만 있음)는 모든 값을 "쓴 시각 0의 미전송"
 * 으로 읽습니다. 예전에는 보내지 못한 답을 구분하지 않았으므로, 서버에
 * 그 답이 아예 없을 때만 다시 보내고 서버에 값이 있으면 서버를 따릅니다.
 */
function sanitizeCache(parsed: unknown): ResponseCache {
  if (!isPlainObject(parsed)) return emptyCache();

  if (parsed.v !== CACHE_VERSION) {
    const answers = sanitizeAnswers(parsed);
    const unsent: UnsentMarks = {};
    for (const [blockId, fields] of Object.entries(answers)) {
      unsent[blockId] = Object.fromEntries(
        Object.keys(fields).map((fieldKey) => [fieldKey, 0]),
      );
    }
    return { answers, unsent, rejected: {} };
  }

  const answers = sanitizeAnswers(parsed.answers);
  const unsent = sanitizeMarks(parsed.unsent, answers);
  const rejected = sanitizeMarks(parsed.rejected, answers);
  // 한 답은 한 곳에만. 겹치면 다시 보내는 쪽(unsent)을 남깁니다.
  for (const [blockId, fields] of Object.entries(unsent)) {
    for (const fieldKey of Object.keys(fields)) {
      if (rejected[blockId]) delete rejected[blockId][fieldKey];
    }
  }
  return { answers, unsent, rejected };
}

function sanitizeMarks(parsed: unknown, answers: BookAnswers): UnsentMarks {
  const marks: UnsentMarks = {};
  if (!isPlainObject(parsed)) return marks;

  for (const [blockId, fields] of Object.entries(parsed)) {
    if (!isPlainObject(fields)) continue;
    for (const [fieldKey, writtenAt] of Object.entries(fields)) {
      // 값이 없는 표시는 보낼 것이 없습니다.
      if (!Object.hasOwn(answers[blockId] ?? {}, fieldKey)) continue;
      if (typeof writtenAt !== "number" || !Number.isFinite(writtenAt)) continue;
      (marks[blockId] ??= {})[fieldKey] = writtenAt;
    }
  }
  return marks;
}

function sanitizeAnswers(parsed: unknown): BookAnswers {
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

/**
 * 서버에서 불러온 응답과 이 기기의 캐시를 합칩니다.
 *
 * **서버가 진실의 원천입니다.** 결과는 서버 값에서 시작하고, 캐시에서는
 * 서버가 아직 받았다고 확인하지 않은 답(`unsent`·`rejected`)만 얹습니다.
 * 그마저도 서버 행이 그 답을 쓴 시각보다 늦게 고쳐졌으면 서버를 따릅니다 —
 * 다른 기기에서 쓴 최신 답이 옛 기기의 캐시로 되돌아가면 안 됩니다.
 *
 * 캐시에만 있고 표시가 없는 값은 버립니다. 서버가 이미 받았다가 다른
 * 기기에서 지운 값일 수 있고, 남기면 저장된 것처럼 보이기만 합니다.
 *
 * `resend`는 다시 보낼 답입니다. 거절된 답은 저절로 보내지 않습니다
 * ({@link ResponseCache.rejected} 참고).
 */
export function mergeLoadedResponses(
  cache: ResponseCache,
  loaded: readonly LoadedResponse[],
): { cache: ResponseCache; resend: ResponseWrite[] } {
  const answers: BookAnswers = {};
  const serverWrittenAt = new Map<string, number>();

  for (const row of loaded) {
    (answers[row.block_id] ??= {})[row.field_key] = answerFromResponse(row);
    // 독자가 쓴 시각으로 겨룹니다. updated_at은 서버 시계이고, 내 저장이
    // 늦게 커밋되거나 장을 옮길 때도 올라가서 방금 쓴 미전송 답이 졌습니다.
    serverWrittenAt.set(
      responseKey(row.block_id, row.field_key),
      Date.parse(row.written_at ?? row.updated_at) || 0,
    );
  }

  const unsent: UnsentMarks = {};
  const rejected: UnsentMarks = {};
  const resend: ResponseWrite[] = [];

  const lanes = [
    { marks: cache.unsent, into: unsent, send: true },
    { marks: cache.rejected, into: rejected, send: false },
  ];
  for (const { marks, into, send } of lanes) {
    for (const [blockId, fields] of Object.entries(marks)) {
      for (const [fieldKey, writtenAt] of Object.entries(fields)) {
        const serverAt = serverWrittenAt.get(responseKey(blockId, fieldKey));
        if (serverAt !== undefined && serverAt >= writtenAt) continue;

        const value = cache.answers[blockId]?.[fieldKey];
        if (value === undefined) continue;

        (answers[blockId] ??= {})[fieldKey] = value;
        (into[blockId] ??= {})[fieldKey] = writtenAt;
        if (send) {
          resend.push({
            block_id: blockId,
            field_key: fieldKey,
            value,
            written_at: writtenAt,
          });
        }
      }
    }
  }

  return { cache: { answers, unsent, rejected }, resend };
}

/** 표시 하나를 더한 새 표. */
export function withMark(
  marks: UnsentMarks,
  blockId: string,
  fieldKey: string,
  writtenAt: number,
): UnsentMarks {
  return { ...marks, [blockId]: { ...marks[blockId], [fieldKey]: writtenAt } };
}

/** 표시 하나를 뺀 새 표. 없으면 그대로 돌려줍니다. */
export function withoutMark(
  marks: UnsentMarks,
  blockId: string,
  fieldKey: string,
): UnsentMarks {
  const fields = marks[blockId];
  if (!fields || !Object.hasOwn(fields, fieldKey)) return marks;

  const rest = { ...fields };
  delete rest[fieldKey];
  const next = { ...marks };
  if (Object.keys(rest).length > 0) next[blockId] = rest;
  else delete next[blockId];
  return next;
}

/** 표에 든 답 전부. */
export function markedWrites(
  cache: ResponseCache,
  marks: UnsentMarks,
): ResponseWrite[] {
  const writes: ResponseWrite[] = [];
  for (const [blockId, fields] of Object.entries(marks)) {
    for (const fieldKey of Object.keys(fields)) {
      const value = cache.answers[blockId]?.[fieldKey];
      if (value === undefined) continue;
      writes.push({
        block_id: blockId,
        field_key: fieldKey,
        value,
        written_at: fields[fieldKey],
      });
    }
  }
  return writes;
}

export function emptyResponseCache(): ResponseCache {
  return emptyCache();
}
