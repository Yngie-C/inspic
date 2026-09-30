"use client";

import type { Element } from "html-react-parser";
import {
  BlockSaveError,
  BlockStatusText,
  WorkbookBlock,
  scaleCellClass,
  scaleGridClass,
  scaleGridStyle,
} from "@/components/ui/workbook-block";
import { describeScale, withSaveState } from "@/lib/workbook/block-status";
import { SCALE_FIELD_KEY } from "@/lib/workbook/types";
import { cn } from "@/lib/utils";
import { registerTemplate } from "./TemplateRenderer";
import { numberAnswer, useBlockAnswers } from "./useBlockAnswers";

interface Props {
  element: Element;
}

function ScaleReader({ element }: Props) {
  const blockId = element.attribs["data-node-id"] || "";
  const min = parseInt(element.attribs["data-min"] || "1", 10);
  const max = parseInt(element.attribs["data-max"] || "10", 10);
  const labelMin = element.attribs["data-label-min"] || "";
  const labelMax = element.attribs["data-label-max"] || "";

  const block = useBlockAnswers(blockId);
  const { answers, setAnswer } = block;
  const selected = numberAnswer(answers, SCALE_FIELD_KEY);
  const status = withSaveState(describeScale(selected), {
    pending: block.save.pending,
    failed: block.saveState === "error",
    savedAt: block.save.savedAt,
  });

  const steps: number[] = [];
  for (let i = min; i <= max; i++) steps.push(i);

  return (
    <section className="template-scale">
      <WorkbookBlock
        kind="척도"
        aside={<BlockStatusText status={status} />}
      >
        <div
          role="group"
          aria-label={`${min}부터 ${max}까지`}
          className={scaleGridClass}
          style={scaleGridStyle(steps.length)}
        >
          {steps.map((val) => (
            <button
              key={val}
              type="button"
              aria-pressed={selected === val}
              onClick={() =>
                setAnswer(SCALE_FIELD_KEY, val === selected ? null : val)
              }
              className={cn(
                scaleCellClass(selected === val),
                "cursor-pointer",
                selected !== val && "hover:border-line-strong",
              )}
            >
              {val}
            </button>
          ))}
        </div>
        {(labelMin || labelMax) && (
          <div className="flex justify-between gap-3 text-caption text-muted">
            <span>{labelMin}</span>
            <span className="text-right">{labelMax}</span>
          </div>
        )}
        {status.tone === "danger" && <BlockSaveError onRetry={block.retry} />}
      </WorkbookBlock>
    </section>
  );
}

registerTemplate("scale", ScaleReader);
export default ScaleReader;
