"use client";

import type { Element } from "html-react-parser";
import { WorkbookBlock } from "@/components/ui/workbook-block";
import { registerTemplate } from "./TemplateRenderer";

type CalloutType = "info" | "warning" | "tip" | "note";

interface Props {
  element: Element;
}

/**
 * 종류는 라벨 텍스트로만 구분합니다. 면색·이모지는 쓰지 않고, 독자가
 * 놓치면 안 되는 `주의`만 warning 색입니다.
 */
const CALLOUT_LABEL: Record<CalloutType, string> = {
  info: "정보",
  warning: "주의",
  tip: "팁",
  note: "참고",
};

function CalloutReader({ element }: Props) {
  const rawType = element.attribs["data-callout-type"] || "note";
  const calloutType: CalloutType =
    rawType in CALLOUT_LABEL ? (rawType as CalloutType) : "note";
  const content = element.attribs["data-content"] || "";

  return (
    <section className="template-callout">
      <WorkbookBlock
        kind={CALLOUT_LABEL[calloutType]}
        kindTone={calloutType === "warning" ? "warning" : "muted"}
      >
        <p className="m-0 whitespace-pre-line">{content}</p>
      </WorkbookBlock>
    </section>
  );
}

registerTemplate("callout", CalloutReader);
export default CalloutReader;
