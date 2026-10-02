"use client";

import { useEffect, useState } from "react";
import type { BlockAnswers } from "@/lib/workbook/response-cache";
import { describeSave, type BlockStatus } from "@/lib/workbook/block-status";
import { isAnsweredValue } from "@/lib/workbook/responses";
import type { useBlockResponses } from "../WorkbookResponsesProvider";

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

/**
 * 값이 하나라도 채워졌는가. "답했다"의 판정은 `isAnsweredValue` 하나에서
 * 옵니다 — 독자의 진행률과 저자가 보는 참여율이 같은 기준이어야 합니다.
 */
export function hasAnyAnswer(answers: BlockAnswers): boolean {
  return Object.values(answers).some(isAnsweredValue);
}

/**
 * 글로 답하는 블록(성찰·목표)의 머리 줄 상태. "저장됨 · 3분 전"이
 * 흘러가도록 저장한 뒤에는 30초마다 다시 셉니다.
 */
export function useSaveStatus(
  block: ReturnType<typeof useBlockResponses>,
): BlockStatus {
  const { savedAt, pending } = block.save;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (savedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [savedAt]);

  return describeSave({
    hasAnswer: hasAnyAnswer(block.answers),
    pending,
    savedAt,
    failed: block.save.failure !== null,
    // 저장 직후에는 now가 savedAt보다 이를 수 있습니다. 그때는 "방금"입니다.
    now: Math.max(now, savedAt ?? 0),
  });
}
