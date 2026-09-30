"use client";

import type { Element } from "html-react-parser";
import {
  BlockSaveError,
  BlockStatusText,
  WorkbookBlock,
} from "@/components/ui/workbook-block";
import { describeChecklist, withSaveState } from "@/lib/workbook/block-status";
import { parseChecklistItems } from "@/lib/workbook/extract-blocks";
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
  const done = items.filter((item) => boolAnswer(answers, item.id)).length;
  const status = withSaveState(describeChecklist(items.length, done), {
    pending: block.save.pending,
    failed: block.saveState === "error",
    savedAt: block.save.savedAt,
  });

  return (
    <section className="template-checklist">
      <WorkbookBlock
        kind="체크리스트"
        aside={<BlockStatusText status={status} />}
      >
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item) => {
            const checked = boolAnswer(answers, item.id);
            return (
              <li key={item.id} className="m-0 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id={`${blockId}-${item.id}`}
                  checked={checked}
                  onChange={() => setAnswer(item.id, !checked)}
                  className="mt-[3px] h-[18px] w-[18px] flex-none cursor-pointer accent-accent"
                />
                <label
                  htmlFor={`${blockId}-${item.id}`}
                  className={cn(
                    "cursor-pointer transition-colors duration-150 ease-out",
                    checked && "text-muted line-through decoration-1",
                  )}
                >
                  {item.text}
                </label>
              </li>
            );
          })}
        </ul>
        {status.tone === "danger" && <BlockSaveError onRetry={block.retry} />}
      </WorkbookBlock>
    </section>
  );
}

registerTemplate("checklist", ChecklistReader);
export default ChecklistReader;
