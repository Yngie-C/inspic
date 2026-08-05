"use client";

import { useEffect, useRef } from "react";
import type { Element } from "html-react-parser";
import { SMART_GOAL_FIELDS } from "@/lib/workbook/types";
import { registerTemplate } from "./TemplateRenderer";
import { textAnswer, useBlockAnswers } from "./useBlockAnswers";

interface Props {
  element: Element;
}

function SmartGoalReader({ element }: Props) {
  const blockId = element.attribs["data-node-id"] || "";
  const { answers, setAnswer } = useBlockAnswers(blockId);

  return (
    <section className="template-smart-goal my-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
      <h3 className="text-sm font-bold text-blue-800 mb-3">SMART 목표 설정</h3>
      <div className="flex flex-col gap-3">
        {SMART_GOAL_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-bold text-blue-700 text-base uppercase">{key}</span>
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            <AutoResizeTextarea
              value={textAnswer(answers, key)}
              onChange={(next) => setAnswer(key, next)}
              placeholder={`${key.toUpperCase()} 항목을 입력하세요...`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
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
      className="w-full resize-none overflow-hidden rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
      rows={2}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

registerTemplate("smart-goal", SmartGoalReader);
export default SmartGoalReader;
