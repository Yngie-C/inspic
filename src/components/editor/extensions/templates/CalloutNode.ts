import { createTemplateNode } from "./BaseTemplateNode";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CalloutNodeView } from "./CalloutNodeView";

export const CalloutNode = createTemplateNode("callout", "callout", {
  calloutType: {
    default: "info",
    parseHTML: (el) => el.getAttribute("data-callout-type") || "info",
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
