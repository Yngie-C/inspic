"use client";

import { useEffect, useState } from "react";
import {
  getBlockAnswers,
  setBlockAnswer,
  type BlockAnswers,
} from "@/lib/template-storage";
import type { WorkbookAnswer } from "@/lib/workbook/types";

/**
 * 블록 하나에 대한 독자 응답을 읽고 씁니다.
 *
 * 서버 렌더에서는 비어 있고 마운트 후에 불러옵니다 — 저장소가 브라우저에만
 * 있어서 첫 렌더에 끼워 넣으면 hydration이 어긋납니다.
 *
 * 응답은 field_key로만 찾습니다. 화면에 몇 번째로 그려지는지는 상관없고,
 * 크리에이터가 문항을 추가·삭제·이동해도 남은 응답은 제자리에 붙습니다.
 *
 * M3에서 이 훅 내부가 `workbook_responses` 조회/저장으로 바뀝니다.
 * 호출하는 컴포넌트는 그대로 둘 수 있게 인터페이스를 맞춰 두었습니다.
 */
export function useBlockAnswers(chapterId: string, blockId: string) {
  const [answers, setAnswers] = useState<BlockAnswers>({});

  useEffect(() => {
    setAnswers(getBlockAnswers(chapterId, blockId));
  }, [chapterId, blockId]);

  function setAnswer(fieldKey: string, value: WorkbookAnswer) {
    setAnswers(setBlockAnswer(chapterId, blockId, fieldKey, value));
  }

  return { answers, setAnswer };
}

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
