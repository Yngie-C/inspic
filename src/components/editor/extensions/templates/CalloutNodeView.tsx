import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { WorkbookBlock } from "@/components/ui/workbook-block";
import {
  CALLOUT_TYPES,
  calloutTypeOf,
  type CalloutType,
} from "@/lib/workbook/block-config";

/** 읽기 뷰(`CalloutReader`)와 같은 라벨. 종류는 라벨로만 구분합니다. */
const CALLOUT_LABEL: Record<CalloutType, string> = {
  note: "참고",
  tip: "팁",
  warning: "주의",
  info: "정보",
};

export function CalloutNodeView({ node, updateAttributes }: NodeViewProps) {
  // 비었거나 모르는 값은 리더·PDF와 같은 종류로 보여 줍니다(코드 리뷰 4-P1-8).
  const calloutType = calloutTypeOf(node.attrs.calloutType);
  const content = (node.attrs.content as string) ?? "";

  return (
    <NodeViewWrapper className="template-callout" data-template-type="callout">
      <WorkbookBlock
        kind={CALLOUT_LABEL[calloutType]}
        kindTone={calloutType === "warning" ? "warning" : "muted"}
        shape="line"
        aside={
          <select
            value={calloutType}
            aria-label="콜아웃 종류"
            onChange={(e) =>
              updateAttributes({ calloutType: e.target.value as CalloutType })
            }
            className="cursor-pointer rounded-sm border border-line bg-surface px-1.5 py-0.5 text-caption text-muted hover:border-line-strong"
          >
            {CALLOUT_TYPES.map((type) => (
              <option key={type} value={type}>
                {CALLOUT_LABEL[type]}
              </option>
            ))}
          </select>
        }
      >
        <textarea
          value={content}
          onChange={(e) => updateAttributes({ content: e.target.value })}
          placeholder="내용을 입력하세요"
          aria-label="콜아웃 내용"
          rows={3}
          className="w-full resize-none rounded-sm bg-transparent text-body text-primary placeholder:text-muted"
        />
      </WorkbookBlock>
    </NodeViewWrapper>
  );
}
