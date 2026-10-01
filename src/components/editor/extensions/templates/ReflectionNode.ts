import { createTemplateNode } from "./BaseTemplateNode";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ReflectionNodeView } from "./ReflectionNodeView";

export const ReflectionNode = createTemplateNode("reflection", "reflection", {
  prompt: {
    default: "이 장의 내용을 이번 주에 어디에 써 볼 수 있을까요?",
    parseHTML: (el) =>
      el.getAttribute("data-prompt") || "이 장의 내용을 이번 주에 어디에 써 볼 수 있을까요?",
    renderHTML: (attrs) => ({ "data-prompt": attrs.prompt as string }),
  },
  placeholder: {
    default: "여기에 적어 보세요",
    parseHTML: (el) =>
      el.getAttribute("data-placeholder") || "여기에 적어 보세요",
    renderHTML: (attrs) => ({ "data-placeholder": attrs.placeholder as string }),
  },
}).extend({
  addNodeView() {
    return ReactNodeViewRenderer(ReflectionNodeView);
  },
});
