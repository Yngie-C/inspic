import { calloutTypeOf } from "@/lib/workbook/block-config";
import { createTemplateNode } from "./BaseTemplateNode";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CalloutNodeView } from "./CalloutNodeView";

export const CalloutNode = createTemplateNode("callout", "callout", {
  calloutType: {
    default: "info",
    // 새 블록은 "정보"로 시작하지만, 불러온 HTML에 값이 없거나 모르는 값이면
    // 리더·추출기·PDF와 같은 대체값을 씁니다.
    parseHTML: (el) => calloutTypeOf(el.getAttribute("data-callout-type")),
    renderHTML: (attrs) => ({ "data-callout-type": attrs.calloutType as string }),
  },
  content: {
    default: "여기에 내용을 입력해 주세요.",
    parseHTML: (el) => el.getAttribute("data-content") || "여기에 내용을 입력해 주세요.",
    renderHTML: (attrs) => ({ "data-content": attrs.content as string }),
  },
}).extend({
  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView);
  },
});
