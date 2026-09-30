import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { WorkbookBlock } from "@/components/ui/workbook-block";

type CalloutType = "info" | "warning" | "tip" | "note";

/** 읽기 뷰(`CalloutReader`)와 같은 라벨. 종류는 라벨로만 구분합니다. */
const CALLOUT_LABEL: Record<CalloutType, string> = {
  note: "참고",
  tip: "팁",
  warning: "주의",
  info: "정보",
};

const CALLOUT_TYPES = Object.keys(CALLOUT_LABEL) as CalloutType[];

export function CalloutNodeView({ node, updateAttributes }: NodeViewProps) {
  const rawType = node.attrs.calloutType as string;
  const calloutType: CalloutType =
    rawType in CALLOUT_LABEL ? (rawType as CalloutType) : "info";
  const content = (node.attrs.content as string) ?? "";

  return (
    <NodeViewWrapper className="template-callout" data-template-type="callout">
      <WorkbookBlock
        kind={CALLOUT_LABEL[calloutType]}
        kindTone={calloutType === "warning" ? "warning" : "muted"}
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
