import { createTemplateNode } from "./BaseTemplateNode";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ReflectionNodeView } from "./ReflectionNodeView";

export const ReflectionNode = createTemplateNode("reflection", "reflection", {
  prompt: {
    default: "이 장의 내용을 이번 주에 어디에 써 볼 수 있을까요?",
    // 속성이 없을 때만 기본값입니다. 저자가 일부러 비운 문구(`""`)를
    // 기본 질문으로 되살리면 리더·추출기가 읽는 값과 달라집니다(4-P1-1).
    parseHTML: (el) =>
      el.getAttribute("data-prompt") ?? "이 장의 내용을 이번 주에 어디에 써 볼 수 있을까요?",
    renderHTML: (attrs) => ({ "data-prompt": attrs.prompt as string }),
  },
  placeholder: {
    default: "여기에 적어 보세요",
    parseHTML: (el) =>
      el.getAttribute("data-placeholder") ?? "여기에 적어 보세요",
    renderHTML: (attrs) => ({ "data-placeholder": attrs.placeholder as string }),
  },
}).extend({
  addNodeView() {
    return ReactNodeViewRenderer(ReflectionNodeView);
  },
});
