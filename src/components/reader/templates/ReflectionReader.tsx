"use client";

import type { Element } from "html-react-parser";
import {
  BlockQuestion,
  BlockSaveError,
  BlockStatusText,
  BlockUnavailable,
  WorkbookBlock,
  blockFieldClass,
} from "@/components/ui/workbook-block";
import { MAX_TEXT_LENGTH } from "@/lib/workbook/response-payload";
import { REFLECTION_FIELD_KEY } from "@/lib/workbook/types";
import { cn } from "@/lib/utils";
import { registerTemplate } from "./TemplateRenderer";
import { useAutoResize } from "./useAutoResize";
import { textAnswer, useBlockAnswers, useSaveStatus } from "./useBlockAnswers";

interface Props {
  element: Element;
}

function ReflectionReader({ element }: Props) {
  const blockId = element.attribs["data-node-id"] || "";
  const prompt = element.attribs["data-prompt"] || "";
  const placeholder =
    element.attribs["data-placeholder"] || "여기에 적어 보세요";

  const block = useBlockAnswers(blockId);
  const value = textAnswer(block.answers, REFLECTION_FIELD_KEY);
  const status = useSaveStatus(block);
  const textareaRef = useAutoResize(value);

  return (
    <section className="template-reflection">
      <WorkbookBlock
        kind="성찰"
        aside={block.canWrite && <BlockStatusText status={status} />}
      >
        {prompt && <BlockQuestion>{prompt}</BlockQuestion>}
        <textarea
          ref={textareaRef}
          value={value}
          placeholder={placeholder}
          aria-label={prompt || "성찰"}
          onChange={(e) => block.setAnswer(REFLECTION_FIELD_KEY, e.target.value)}
          // 서버 상한과 같습니다. 넘긴 답은 저장되지 않습니다.
          maxLength={MAX_TEXT_LENGTH}
          readOnly={!block.canWrite}
          rows={3}
          className={cn(blockFieldClass, "min-h-24 resize-none overflow-y-auto")}
        />
        {!block.canWrite && <BlockUnavailable />}
        {block.save.failure && (
          <BlockSaveError failure={block.save.failure} onRetry={block.retry} />
        )}
      </WorkbookBlock>
    </section>
  );
}

registerTemplate("reflection", ReflectionReader);
export default ReflectionReader;
