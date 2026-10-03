import { createTemplateNode } from "./BaseTemplateNode";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ScaleNodeView } from "./ScaleNodeView";

export const ScaleNode = createTemplateNode("scale", "scale", {
  min: {
    default: "1",
    // 속성이 없을 때만 기본값입니다(4-P1-1). 비었거나 숫자가 아닌 끝값은
    // scaleRange()가 에디터·리더·추출기에서 같게 해석합니다.
    parseHTML: (el) => el.getAttribute("data-min") ?? "1",
    renderHTML: (attrs) => ({ "data-min": attrs.min as string }),
  },
  max: {
    default: "10",
    parseHTML: (el) => el.getAttribute("data-max") ?? "10",
    renderHTML: (attrs) => ({ "data-max": attrs.max as string }),
  },
  labelMin: {
    default: "낮음",
    parseHTML: (el) => el.getAttribute("data-label-min") ?? "낮음",
    renderHTML: (attrs) => ({ "data-label-min": attrs.labelMin as string }),
  },
  labelMax: {
    default: "높음",
    parseHTML: (el) => el.getAttribute("data-label-max") ?? "높음",
    renderHTML: (attrs) => ({ "data-label-max": attrs.labelMax as string }),
  },
  // 선택값(data-value)은 두지 않습니다. 스케일의 값은 독자의 응답이고,
  // 응답은 블록 정의가 아니라 workbook_responses에 삽니다.
}).extend({
  addNodeView() {
    return ReactNodeViewRenderer(ScaleNodeView);
  },
});
