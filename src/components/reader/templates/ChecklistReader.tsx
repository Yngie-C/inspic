"use client";

import type { Element } from "html-react-parser";
import { parseChecklistItems } from "@/lib/workbook/extract-blocks";
import { registerTemplate } from "./TemplateRenderer";
import { boolAnswer, useBlockAnswers } from "./useBlockAnswers";

interface Props {
  element: Element;
}

function ChecklistReader({ element }: Props) {
  const blockId = element.attribs["data-node-id"] || "";
  const items = parseChecklistItems(element.attribs["data-items"]);
  const { answers, setAnswer } = useBlockAnswers(blockId);

  return (
    <section className="template-checklist my-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <ul className="space-y-2">
        {items.map((item) => {
          const checked = boolAnswer(answers, item.id);
          return (
            <li key={item.id} className="flex items-start gap-3">
              <input
                type="checkbox"
                id={`${blockId}-${item.id}`}
                checked={checked}
                onChange={() => setAnswer(item.id, !checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer rounded border-gray-300 accent-blue-600 dark:border-gray-600"
              />
              <label
                htmlFor={`${blockId}-${item.id}`}
                className={`cursor-pointer text-sm leading-relaxed ${
                  checked
                    ? "text-gray-400 line-through dark:text-gray-500"
                    : "text-gray-800 dark:text-gray-200"
                }`}
              >
                {item.text}
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

registerTemplate("checklist", ChecklistReader);
export default ChecklistReader;
