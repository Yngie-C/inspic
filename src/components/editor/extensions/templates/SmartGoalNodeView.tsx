import { NodeViewWrapper } from "@tiptap/react";
import { SMART_GOAL_FIELDS } from "@/lib/workbook/types";

/**
 * S/M/A/R/T 다섯 칸은 독자가 채웁니다. 저작 화면에서는 모양만 보여줍니다.
 */
export function SmartGoalNodeView() {
  return (
    <NodeViewWrapper className="template-smart-goal" data-template-type="smart-goal">
      <div className="my-2 rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-bold text-gray-700">SMART 목표 설정</h3>
        <div className="flex flex-col gap-3">
          {SMART_GOAL_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-sm font-bold uppercase text-gray-700">{key}</span>
              <p className="text-xs text-gray-400">{label}</p>
              <div className="min-h-[60px] rounded border border-dashed border-gray-200 bg-gray-50" />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-400">독자가 작성하는 칸입니다.</p>
      </div>
    </NodeViewWrapper>
  );
}
