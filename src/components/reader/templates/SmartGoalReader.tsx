"use client";

import type { Element } from "html-react-parser";
import {
  BlockQuestion,
  BlockSaveError,
  BlockStatusText,
  BlockUnavailable,
  SmartFieldLabel,
  WorkbookBlock,
  blockFieldClass,
} from "@/components/ui/workbook-block";
import { MAX_TEXT_LENGTH } from "@/lib/workbook/response-payload";
import { SMART_GOAL_FIELDS } from "@/lib/workbook/types";
import { cn } from "@/lib/utils";
import { registerTemplate } from "./TemplateRenderer";
import { useAutoResize } from "./useAutoResize";
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
      <WorkbookBlock
        kind="목표"
        aside={block.canWrite && <BlockStatusText status={status} />}
      >
        <BlockQuestion>SMART 목표를 세워 보세요</BlockQuestion>
        <div className="flex flex-col gap-4">
          {SMART_GOAL_FIELDS.map(({ key, term, question }) => (
            <label key={key} className="flex flex-col gap-1.5">
              <SmartFieldLabel term={term} question={question} />
              <AutoResizeTextarea
                value={textAnswer(block.answers, key)}
                readOnly={!block.canWrite}
                onChange={(next) => block.setAnswer(key, next)}
              />
            </label>
          ))}
        </div>
        {!block.canWrite && <BlockUnavailable />}
        {block.save.failure && (
          <BlockSaveError failure={block.save.failure} onRetry={block.retry} />
        )}
      </WorkbookBlock>
    </section>
  );
}

function AutoResizeTextarea({
  value,
  readOnly,
  onChange,
}: {
  value: string;
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  const ref = useAutoResize(value);

  return (
    <textarea
      ref={ref}
      className={cn(blockFieldClass, "resize-none overflow-y-auto")}
      rows={1}
      value={value}
      maxLength={MAX_TEXT_LENGTH}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

registerTemplate("smart-goal", SmartGoalReader);
export default SmartGoalReader;
