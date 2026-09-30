"use client";

import { useEffect, useRef } from "react";
import type { Element } from "html-react-parser";
import {
  BlockQuestion,
  BlockSaveError,
  BlockStatusText,
  WorkbookBlock,
  blockFieldClass,
} from "@/components/ui/workbook-block";
import { REFLECTION_FIELD_KEY } from "@/lib/workbook/types";
import { cn } from "@/lib/utils";
import { registerTemplate } from "./TemplateRenderer";
import { textAnswer, useBlockAnswers, useSaveStatus } from "./useBlockAnswers";

interface Props {
  element: Element;
}

function ReflectionReader({ element }: Props) {
  const blockId = element.attribs["data-node-id"] || "";
  const prompt = element.attribs["data-prompt"] || "";
  const placeholder =
    element.attribs["data-placeholder"] || "여기에 생각을 적어보세요...";

  const block = useBlockAnswers(blockId);
  const value = textAnswer(block.answers, REFLECTION_FIELD_KEY);
  const status = useSaveStatus(block);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <section className="template-reflection">
      <WorkbookBlock kind="성찰" aside={<BlockStatusText status={status} />}>
        {prompt && <BlockQuestion>{prompt}</BlockQuestion>}
        <textarea
          ref={textareaRef}
          value={value}
          placeholder={placeholder}
          aria-label={prompt || "성찰"}
          onChange={(e) => block.setAnswer(REFLECTION_FIELD_KEY, e.target.value)}
          rows={3}
          className={cn(blockFieldClass, "min-h-24 resize-none overflow-hidden")}
        />
        {status.tone === "danger" && <BlockSaveError onRetry={block.retry} />}
      </WorkbookBlock>
    </section>
  );
}

registerTemplate("reflection", ReflectionReader);
export default ReflectionReader;
