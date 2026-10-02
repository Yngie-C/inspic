"use client";

import { useId } from "react";
import type { Element } from "html-react-parser";
import {
  BlockSaveError,
  BlockStatusText,
  BlockUnavailable,
  WorkbookBlock,
} from "@/components/ui/workbook-block";
import { describeChecklist, withSaveState } from "@/lib/workbook/block-status";
import { parseChecklistItems } from "@/lib/workbook/extract-blocks";
import { isStorableFieldKey } from "@/lib/template-node-id";
import { cn } from "@/lib/utils";
import { registerTemplate } from "./TemplateRenderer";
import { boolAnswer, useBlockAnswers } from "./useBlockAnswers";

interface Props {
  element: Element;
}

function ChecklistReader({ element }: Props) {
  const blockId = element.attribs["data-node-id"] || "";
  const items = parseChecklistItems(element.attribs["data-items"]);
  const block = useBlockAnswers(blockId);
  const { answers, setAnswer } = block;
  // 라벨과 체크박스를 잇는 id. 블록 ID로 만들면 ID 없는 블록끼리 겹쳐
  // 라벨을 누르면 다른 블록이 토글됐습니다.
  const idPrefix = useId();
  const done = items.filter((item) => boolAnswer(answers, item.id)).length;
  const status = withSaveState(describeChecklist(items.length, done), {
    pending: block.save.pending,
    failed: block.save.failure !== null,
    savedAt: block.save.savedAt,
  });

  return (
    <section className="template-checklist">
      <WorkbookBlock
        kind="체크리스트"
        aside={<BlockStatusText status={status} />}
      >
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item, index) => {
            const checked = boolAnswer(answers, item.id);
            const inputId = `${idPrefix}-${index}`;
            // 항목 키가 저장 한도를 넘으면 답이 매달릴 곳이 없습니다.
            const writable = block.canWrite && isStorableFieldKey(item.id);
            return (
              <li key={item.id} className="m-0 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id={inputId}
                  checked={checked}
                  disabled={!writable}
                  onChange={() => setAnswer(item.id, !checked)}
                  className="mt-[3px] h-[18px] w-[18px] flex-none cursor-pointer accent-accent disabled:cursor-default"
                />
                <label
                  htmlFor={inputId}
                  className={cn(
                    "transition-colors duration-150 ease-out",
                    writable && "cursor-pointer",
                    checked && "text-muted line-through decoration-1",
                  )}
                >
                  {item.text}
                </label>
              </li>
            );
          })}
        </ul>
        {!block.canWrite && <BlockUnavailable />}
        {block.save.failure && (
          <BlockSaveError failure={block.save.failure} onRetry={block.retry} />
        )}
      </WorkbookBlock>
    </section>
  );
}

registerTemplate("checklist", ChecklistReader);
export default ChecklistReader;
