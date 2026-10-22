import {
  describeChecklist,
  describeScale,
  type BlockStatus,
} from "@/lib/workbook/block-status";
import { isInScale, scaleRange } from "@/lib/workbook/block-config";
import { parseChecklistItems } from "@/lib/workbook/extract-blocks";
import type { BlockAnswers } from "@/lib/workbook/response-cache";
import { isAnsweredValue } from "@/lib/workbook/responses";
import {
  REFLECTION_FIELD_KEY,
  SCALE_FIELD_KEY,
  SMART_GOAL_FIELDS,
} from "@/lib/workbook/types";

/**
 * 쪽 안에 그리는 워크북 카드의 내용.
 *
 * 카드는 높이가 답에 따라 변하면 안 됩니다 — 변하면 입력할 때마다 쪽을
 * 다시 나눠, 쓰는 중에 블록이 다음 쪽으로 넘어갑니다
 * (`docs/agent-knowledge/paged-reader-decision.md`). 그래서 질문 한 줄과
 * 내 답 한 줄만 싣고, 전체는 시트에서 봅니다.
 *
 * 상태 문구는 블록 템플릿과 같은 `block-status.ts`에서 옵니다.
 */

/** 카드로 그리는 블록. 입력이 없는 Callout은 본문에 그대로 둡니다. */
export const CARD_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "checklist",
  "scale",
  "reflection",
  "smart-goal",
]);

export interface CardSummary {
  /** 블록 라벨. 템플릿과 같은 문구. */
  kind: string;
  question: string;
  /** 내 답 한 줄. 답이 없으면 null. */
  preview: string | null;
  /**
   * 진행을 말하는 블록(체크리스트·척도)의 상태. 글로 답하는 블록은
   * null이고, 카드가 `useSaveStatus()`로 저장 상태를 씁니다.
   */
  progress: BlockStatus | null;
}

type Attributes = Record<string, string | undefined>;

function textOf(answers: BlockAnswers, key: string): string | null {
  const value = answers[key];
  return typeof value === "string" && isAnsweredValue(value) ? value : null;
}

export function summarizeBlock(
  type: string,
  attrs: Attributes,
  answers: BlockAnswers,
): CardSummary | null {
  switch (type) {
    case "checklist": {
      const items = parseChecklistItems(attrs["data-items"]);
      const done = items.filter((item) => answers[item.id] === true);
      const shown = items.slice(0, 2).map((item) => item.text).join(" · ");
      return {
        kind: "체크리스트",
        question: items.length > 2 ? `${shown} 외 ${items.length - 2}개` : shown,
        preview: done.length ? done.map((item) => item.text).join(", ") : null,
        progress: describeChecklist(items.length, done.length),
      };
    }
    case "scale": {
      const range = scaleRange(attrs["data-min"], attrs["data-max"]);
      const stored = answers[SCALE_FIELD_KEY];
      const value = typeof stored === "number" ? stored : null;
      const inRange = value !== null && isInScale(value, range);
      const labelMin = attrs["data-label-min"] || "";
      const labelMax = attrs["data-label-max"] || "";
      return {
        kind: "척도",
        question:
          labelMin && labelMax
            ? `${labelMin}에서 ${labelMax}까지`
            : `${range.min}부터 ${range.max}까지`,
        // "7을/2를"처럼 숫자마다 조사가 달라 조사 없이 씁니다.
        preview: inRange ? `고른 값 ${value}` : null,
        progress: describeScale(inRange ? value : null, inRange ? null : value),
      };
    }
    case "smart-goal": {
      const first = SMART_GOAL_FIELDS.find(({ key }) => textOf(answers, key));
      return {
        kind: "목표",
        question: "SMART 목표를 세워 보세요",
        preview: first ? textOf(answers, first.key) : null,
        progress: null,
      };
    }
    case "reflection":
      return {
        kind: "성찰",
        question: attrs["data-prompt"] || "",
        preview: textOf(answers, REFLECTION_FIELD_KEY),
        progress: null,
      };
    default:
      return null;
  }
}
