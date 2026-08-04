import { createTemplateNode } from "./BaseTemplateNode";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { SmartGoalNodeView } from "./SmartGoalNodeView";

// Node 이름은 insertContent에서 쓰는 식별자, 두 번째 인자는 HTML에 박히는
// data-template-type입니다. 후자는 리더 컴포넌트·EPUB/PDF 폴백·워크북 블록
// 추출기가 함께 보는 값이라 "smart-goal"로 통일합니다.
//
// S/M/A/R/T 다섯 칸은 문항이 고정이라 별도 속성이 필요 없고, 그 안에
// 적히는 내용은 독자의 응답이라 정의에 담지 않습니다.
export const SmartGoalNode = createTemplateNode("smartGoal", "smart-goal").extend({
  addNodeView() {
    return ReactNodeViewRenderer(SmartGoalNodeView);
  },
});
