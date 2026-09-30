"use client";

import { useEffect, useRef } from "react";
import type { Element } from "html-react-parser";
import {
  BlockQuestion,
  BlockSaveError,
  BlockStatusText,
  SmartFieldLabel,
  WorkbookBlock,
  blockFieldClass,
} from "@/components/ui/workbook-block";
import { SMART_GOAL_FIELDS } from "@/lib/workbook/types";
import { cn } from "@/lib/utils";
import { registerTemplate } from "./TemplateRenderer";
import { textAnswer, useBlockAnswers, useSaveStatus } from "./useBlockAnswers";

interface Props {
  element: Element;
}

function SmartGoalReader({ element }: Props) {
  const blockId = element.attribs["data-node-id"] || "";
  const block = useBlockAnswers(blockId);
  const status = useSaveStatus(block);

  return (
    <section className="template-smart-goal">
      <WorkbookBlock kind="목표" aside={<BlockStatusText status={status} />}>
        <BlockQuestion>SMART 목표를 세워 보세요</BlockQuestion>
        <div className="flex flex-col gap-4">
          {SMART_GOAL_FIELDS.map(({ key, term, question }) => (
            <label key={key} className="flex flex-col gap-1.5">
              <SmartFieldLabel term={term} question={question} />
              <AutoResizeTextarea
                value={textAnswer(block.answers, key)}
                onChange={(next) => block.setAnswer(key, next)}
              />
            </label>
          ))}
        </div>
        {status.tone === "danger" && <BlockSaveError onRetry={block.retry} />}
      </WorkbookBlock>
    </section>
  );
}

function AutoResizeTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={cn(blockFieldClass, "resize-none overflow-hidden")}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

registerTemplate("smart-goal", SmartGoalReader);
export default SmartGoalReader;
