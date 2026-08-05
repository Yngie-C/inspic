"use client";

import type { BlockAnswers } from "@/lib/workbook/response-cache";

export { useBlockResponses as useBlockAnswers } from "../WorkbookResponsesProvider";

/**
 * 워크북 리더 템플릿이 응답을 꺼내 쓰는 헬퍼.
 *
 * 값은 `workbook_responses`에서 오고, 저장도 그리로 갑니다
 * (`WorkbookResponsesProvider`). 블록이 알아야 하는 것은 자기 `block_id`
 * 하나뿐입니다 — 어느 챕터에 있는지는 응답의 정체성에 들어가지 않고,
 * 서버가 블록 정의에서 읽습니다.
 */

/** 문자열 응답을 꺼냅니다. 미응답이면 빈 문자열. */
export function textAnswer(answers: BlockAnswers, fieldKey: string): string {
  const value = answers[fieldKey];
  return typeof value === "string" ? value : "";
}

/** 숫자 응답을 꺼냅니다. 미응답이면 null. */
export function numberAnswer(
  answers: BlockAnswers,
  fieldKey: string,
): number | null {
  const value = answers[fieldKey];
  return typeof value === "number" ? value : null;
}

/** 참/거짓 응답을 꺼냅니다. 미응답이면 false. */
export function boolAnswer(answers: BlockAnswers, fieldKey: string): boolean {
  return answers[fieldKey] === true;
}
