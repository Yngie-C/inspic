"use client";

import type { Element } from "html-react-parser";
import { WorkbookBlock } from "@/components/ui/workbook-block";
import { calloutTypeOf, type CalloutType } from "@/lib/workbook/block-config";
import { registerTemplate } from "./TemplateRenderer";

interface Props {
  element: Element;
}

/**
 * 입력이 없는 블록이라 박스 대신 왼쪽 세로선으로 그립니다.
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
  const calloutType = calloutTypeOf(element.attribs["data-callout-type"]);
  const content = element.attribs["data-content"] || "";

  return (
    <section className="template-callout">
      <WorkbookBlock
        kind={CALLOUT_LABEL[calloutType]}
        kindTone={calloutType === "warning" ? "warning" : "muted"}
        shape="line"
      >
        <p className="m-0 whitespace-pre-line">{content}</p>
      </WorkbookBlock>
    </section>
  );
}

registerTemplate("callout", CalloutReader);
export default CalloutReader;
