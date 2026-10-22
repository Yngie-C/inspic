"use client";

import type { Element } from "html-react-parser";
import { Button } from "@/components/ui/button";
import { BlockStatusText, WorkbookBlock } from "@/components/ui/workbook-block";
import { withSaveState } from "@/lib/workbook/block-status";
import { cn } from "@/lib/utils";
import type { BlockLock } from "../WorkbookResponsesProvider";
import { useBlockAnswers, useSaveStatus } from "../templates/useBlockAnswers";
import { summarizeBlock } from "./card-summary";

/** 쓸 수 없을 때 내 답 자리에 쓰는 한 줄. 자세한 안내는 시트의 블록이 합니다. */
const LOCK_LINE: Record<BlockLock, string> = {
  "sign-in": "로그인하면 여기에 쓸 수 있어요.",
  purchase: "구매하면 여기에 쓸 수 있어요.",
  unavailable: "이 블록은 아직 답을 받을 수 없어요.",
};

/**
 * 쪽 안의 워크북 블록. 질문 한 줄 · 내 답 한 줄 · 버튼이고, 쓰기는
 * 버튼으로 여는 시트(`BlockSheet`)에서 합니다.
 *
 * 줄마다 높이를 고정합니다. 답이 생기거나 길어져도 카드 높이가 그대로여야
 * 그 뒤 본문이 다음 쪽으로 밀리지 않습니다. 저장 실패 문장도 여기 싣지
 * 않고(상태만 "저장 안 됨") 시트에서 보여 줍니다.
 */
export function BlockCard({
  element,
  type,
  onOpen,
}: {
  element: Element;
  type: string;
  onOpen: (element: Element) => void;
}) {
  const block = useBlockAnswers(element.attribs["data-node-id"] || "");
  const saveStatus = useSaveStatus(block);
  const summary = summarizeBlock(type, element.attribs, block.answers);
  if (!summary) return null;

  const status = summary.progress
    ? withSaveState(summary.progress, {
        pending: block.save.pending,
        failed: block.save.failure !== null,
        savedAt: block.save.savedAt,
      })
    : saveStatus;
  // 템플릿과 같게, 글로 답하는 블록은 쓸 수 있을 때만 상태를 보입니다.
  const showStatus = block.canWrite || summary.progress !== null;
  const line = block.lock
    ? LOCK_LINE[block.lock]
    : (summary.preview ?? "아직 쓰지 않았어요.");

  return (
    <section className="paged-card" data-workbook-card>
      <WorkbookBlock
        kind={summary.kind}
        aside={showStatus && <BlockStatusText status={status} />}
        className="gap-2"
      >
        <p className="m-0 h-[1.5em] truncate text-subtitle leading-[1.5] text-primary">
          {summary.question}
        </p>
        <p
          className={cn(
            "m-0 h-[1.6em] truncate text-body-sm leading-[1.6]",
            summary.preview && !block.lock ? "text-primary" : "text-muted",
          )}
        >
          {line}
        </p>
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => onOpen(element)}>
            {!block.canWrite ? "보기" : summary.preview ? "이어 쓰기" : "작성하기"}
          </Button>
        </div>
      </WorkbookBlock>
    </section>
  );
}
