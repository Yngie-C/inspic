"use client";

import type { Element } from "html-react-parser";
import { registerTemplate } from "./TemplateRenderer";

type CalloutType = "info" | "warning" | "tip" | "note";

interface Props {
  element: Element;
}

const CALLOUT_CONFIG: Record<
  CalloutType,
  { icon: string; bg: string; border: string; title: string; titleColor: string }
> = {
  info: {
    icon: "ℹ️",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-300 dark:border-blue-700",
    title: "Info",
    titleColor: "text-blue-700 dark:text-blue-300",
  },
  warning: {
    icon: "⚠️",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-300 dark:border-amber-700",
    title: "Warning",
    titleColor: "text-amber-700 dark:text-amber-300",
  },
  tip: {
    icon: "💡",
    bg: "bg-green-50 dark:bg-green-950/40",
    border: "border-green-300 dark:border-green-700",
    title: "Tip",
    titleColor: "text-green-700 dark:text-green-300",
  },
  note: {
    icon: "📝",
    bg: "bg-gray-50 dark:bg-gray-800",
    border: "border-gray-300 dark:border-gray-600",
    title: "Note",
    titleColor: "text-gray-700 dark:text-gray-300",
  },
};

function CalloutReader({ element }: Props) {
  const rawType = element.attribs["data-callout-type"] || "note";
  const calloutType: CalloutType =
    rawType in CALLOUT_CONFIG ? (rawType as CalloutType) : "note";
  const content = element.attribs["data-content"] || "";
  const config = CALLOUT_CONFIG[calloutType];

  return (
    <section
      className={`template-callout my-4 rounded-lg border-l-4 p-4 ${config.bg} ${config.border}`}
    >
      <div className={`mb-1 flex items-center gap-2 font-semibold ${config.titleColor}`}>
        <span aria-hidden="true">{config.icon}</span>
        <span>{config.title}</span>
      </div>
      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{content}</p>
    </section>
  );
}

registerTemplate("callout", CalloutReader);
export default CalloutReader;
