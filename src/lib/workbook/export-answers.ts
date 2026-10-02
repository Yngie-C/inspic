import { extractWorkbookBlocks } from "./extract-blocks";
import { answerFromResponse, responseKey } from "./responses";
import type { FallbackAnswers } from "@/lib/template-fallback";
import type { OrphanedTextAnswer } from "@/lib/pdf-generator";

/**
 * 내보내기에 실을 응답을 "지금 책에 있는 문항의 답"과 "정의가 사라진
 * 문항의 답"으로 나눕니다.
 *
 * 어떤 문항이 지금 책에 있는지는 챕터 HTML이 정합니다. M3에서 정한
 * 대로입니다 — 화면에 무엇이 어디 있는지는 본문 HTML이 정하고, DB의
 * 정의는 저장할 때 서버가 판정 기준으로 씁니다. 여기서 DB 정의를 다시
 * 읽으면 본문과 어긋났을 때 답이 통째로 고아로 분류됩니다.
 */

export interface StoredResponseRow {
  /** 장이 지워졌으면 null. 그 답은 정의가 사라진 답(고아)으로 갑니다. */
  chapter_id: string | null;
  block_id: string;
  field_key: string;
  value_text: string | null;
  value_number: number | null;
  value_bool: boolean | null;
}

export interface SplitAnswers {
  /** block_id → (field_key → 값). 본문 제자리에 채워집니다. */
  answers: FallbackAnswers;
  /**
   * 정의가 사라진 문항의 자유서술 답.
   *
   * 체크 여부나 척도 값은 여기 넣지 않습니다. 저자가 문항을 지우면
   * 질문 문구(`workbook_block_fields.label`)도 함께 지워지므로,
   * `true`나 `7`만 남으면 읽는 사람에게 아무 뜻도 되지 않습니다.
   * 버리는 것은 아닙니다 — DB에는 그대로 있습니다.
   */
  orphans: OrphanedTextAnswer[];
}

export function splitAnswers(
  chapters: readonly { id: string; content_html?: string | null }[],
  responses: readonly StoredResponseRow[],
): SplitAnswers {
  const known = new Set<string>();
  for (const chapter of chapters) {
    for (const block of extractWorkbookBlocks(chapter.content_html ?? "")) {
      for (const field of block.fields) {
        known.add(responseKey(block.id, field.field_key));
      }
    }
  }

  const answers: FallbackAnswers = {};
  const orphans: OrphanedTextAnswer[] = [];

  for (const response of responses) {
    if (known.has(responseKey(response.block_id, response.field_key))) {
      (answers[response.block_id] ??= {})[response.field_key] =
        answerFromResponse(response);
      continue;
    }

    const text = response.value_text?.trim();
    if (text) orphans.push({ chapter_id: response.chapter_id, text });
  }

  return { answers, orphans };
}
