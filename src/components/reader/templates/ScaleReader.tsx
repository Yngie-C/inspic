"use client";

import type { Element } from "html-react-parser";
import { SCALE_FIELD_KEY } from "@/lib/workbook/types";
import { registerTemplate } from "./TemplateRenderer";
import { numberAnswer, useBlockAnswers } from "./useBlockAnswers";

interface Props {
  element: Element;
  chapterId: string;
}

function ScaleReader({ element, chapterId }: Props) {
  const blockId = element.attribs["data-node-id"] || "";
  const min = parseInt(element.attribs["data-min"] || "1", 10);
  const max = parseInt(element.attribs["data-max"] || "10", 10);
  const labelMin = element.attribs["data-label-min"] || "";
  const labelMax = element.attribs["data-label-max"] || "";

  const { answers, setAnswer } = useBlockAnswers(chapterId, blockId);
  const selected = numberAnswer(answers, SCALE_FIELD_KEY);

  const steps: number[] = [];
  for (let i = min; i <= max; i++) steps.push(i);

  return (
    <section className="template-scale my-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <div className="flex items-center gap-2 flex-wrap">
        {labelMin && (
          <span className="text-xs text-gray-500 shrink-0">{labelMin}</span>
        )}
        <div className="flex gap-1 flex-wrap">
          {steps.map((val) => (
            <button
              key={val}
              onClick={() => setAnswer(SCALE_FIELD_KEY, val === selected ? null : val)}
              className={`w-8 h-8 rounded text-sm font-medium border transition-colors ${
                selected === val
                  ? "bg-blue-500 text-white border-blue-500"
                  : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600"
              }`}
            >
              {val}
            </button>
          ))}
        </div>
        {labelMax && (
          <span className="text-xs text-gray-500 shrink-0">{labelMax}</span>
        )}
      </div>
    </section>
  );
}

registerTemplate("scale", ScaleReader);
export default ScaleReader;
