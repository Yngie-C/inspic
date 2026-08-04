import type { WorkbookAnswer } from "./workbook/types";

/**
 * 독자 응답의 오프라인 캐시.
 *
 * 진실의 원천은 DB(`workbook_responses`)입니다. M3에서 DB 저장이 붙기
 * 전까지는 이 캐시가 유일한 저장소지만, 식별 구조는 DB와 같게 둡니다 —
 * (chapter_id, block_id) 안에서 field_key로 찾습니다. 배열 인덱스나
 * 길이로 매칭하지 않으므로, 크리에이터가 문항을 추가·삭제·이동해도
 * 남은 문항의 응답은 그대로 붙어 있습니다.
 */

const PREFIX = "inspic_workbook";

/** 한 블록의 응답. 키는 field_key. */
export type BlockAnswers = Record<string, WorkbookAnswer>;

function buildKey(chapterId: string, blockId: string): string {
  return `${PREFIX}:${chapterId}:${blockId}`;
}

export function getBlockAnswers(
  chapterId: string,
  blockId: string,
): BlockAnswers {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(buildKey(chapterId, blockId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as BlockAnswers;
  } catch {
    return {};
  }
}

export function setBlockAnswer(
  chapterId: string,
  blockId: string,
  fieldKey: string,
  value: WorkbookAnswer,
): BlockAnswers {
  const next = { ...getBlockAnswers(chapterId, blockId), [fieldKey]: value };
  if (typeof window === "undefined") return next;
  try {
    localStorage.setItem(buildKey(chapterId, blockId), JSON.stringify(next));
  } catch {
    // quota exceeded — 캐시일 뿐이므로 조용히 넘어갑니다.
  }
  return next;
}

export function clearBlockAnswers(chapterId: string, blockId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(buildKey(chapterId, blockId));
}
