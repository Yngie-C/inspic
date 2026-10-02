"use client";

import type { Element } from "html-react-parser";
import {
  BlockSaveError,
  BlockStatusText,
  BlockUnavailable,
  WorkbookBlock,
  scaleCellClass,
  scaleGridClass,
  scaleGridStyle,
} from "@/components/ui/workbook-block";
import { describeScale, withSaveState } from "@/lib/workbook/block-status";
import { isInScale, scaleRange, scaleSteps } from "@/lib/workbook/block-config";
import { SCALE_FIELD_KEY } from "@/lib/workbook/types";
import { cn } from "@/lib/utils";
import { registerTemplate } from "./TemplateRenderer";
import { numberAnswer, useBlockAnswers } from "./useBlockAnswers";

interface Props {
  element: Element;
}

function ScaleReader({ element }: Props) {
  const blockId = element.attribs["data-node-id"] || "";
  // 범위 해석은 에디터·추출기·저장 라우트와 같은 함수입니다. 각자 읽으면
  // 화면의 칸과 서버가 받는 값이 어긋납니다.
  const range = scaleRange(
    element.attribs["data-min"],
    element.attribs["data-max"],
  );
  const labelMin = element.attribs["data-label-min"] || "";
  const labelMax = element.attribs["data-label-max"] || "";

  const block = useBlockAnswers(blockId);
  const { answers, setAnswer } = block;
  const stored = numberAnswer(answers, SCALE_FIELD_KEY);
  // 저자가 범위를 줄이면 예전 답이 칸 밖에 남습니다. 눌린 칸 없이
  // "N 선택됨"이라 하면 어디를 눌러야 할지 모르니, 예전 답이라고 말하고
  // 칸 중 하나를 고르면 덮어씁니다.
  const inRange = stored !== null && isInScale(stored, range);
  const selected = inRange ? stored : null;
  const status = withSaveState(describeScale(selected, inRange ? null : stored), {
    pending: block.save.pending,
    failed: block.save.failure !== null,
    savedAt: block.save.savedAt,
  });
  const steps = scaleSteps(range);

  return (
    <section className="template-scale">
      <WorkbookBlock
        kind="척도"
        aside={<BlockStatusText status={status} />}
      >
        <div
          role="group"
          aria-label={`${range.min}부터 ${range.max}까지`}
          className={scaleGridClass}
          style={scaleGridStyle(steps.length)}
        >
          {steps.map((val) => (
            <button
              key={val}
              type="button"
              aria-pressed={selected === val}
              disabled={!block.canWrite}
              onClick={() =>
                setAnswer(SCALE_FIELD_KEY, val === selected ? null : val)
              }
              className={cn(
                scaleCellClass(selected === val),
                block.canWrite && "cursor-pointer",
                block.canWrite && selected !== val && "hover:border-line-strong",
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
        {!block.canWrite && <BlockUnavailable />}
        {block.save.failure && (
          <BlockSaveError failure={block.save.failure} onRetry={block.retry} />
        )}
      </WorkbookBlock>
    </section>
  );
}

registerTemplate("scale", ScaleReader);
export default ScaleReader;
