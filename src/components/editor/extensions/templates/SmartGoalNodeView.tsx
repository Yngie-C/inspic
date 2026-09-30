import { NodeViewWrapper } from "@tiptap/react";
import {
  BlockQuestion,
  SmartFieldLabel,
  WorkbookBlock,
} from "@/components/ui/workbook-block";
import { SMART_GOAL_FIELDS } from "@/lib/workbook/types";

/**
 * S/M/A/R/T 다섯 칸은 독자가 채웁니다. 저작 화면에서는 모양만 보여줍니다.
 */
export function SmartGoalNodeView() {
  return (
    <NodeViewWrapper className="template-smart-goal" data-template-type="smart-goal">
      <WorkbookBlock
        kind="목표"
        aside={<span className="text-caption text-muted">독자가 작성</span>}
      >
        <BlockQuestion>SMART 목표를 세워 보세요</BlockQuestion>
        <div className="flex flex-col gap-4">
          {SMART_GOAL_FIELDS.map(({ key, term, question }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <SmartFieldLabel term={term} question={question} />
              <div className="h-11 rounded-md border border-field-line bg-field" />
            </div>
          ))}
        </div>
      </WorkbookBlock>
    </NodeViewWrapper>
  );
}
