import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  WorkbookBlock,
  scaleCellClass,
  scaleGridClass,
  scaleGridStyle,
} from "@/components/ui/workbook-block";

export function ScaleNodeView({ node, updateAttributes }: NodeViewProps) {
  const min = parseInt(node.attrs.min as string, 10) || 1;
  const max = parseInt(node.attrs.max as string, 10) || 10;
  const labelMin = (node.attrs.labelMin as string) ?? "낮음";
  const labelMax = (node.attrs.labelMax as string) ?? "높음";

  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const labelInput =
    "w-32 rounded-sm border border-line bg-surface px-1.5 py-0.5 text-caption text-primary placeholder:text-muted hover:border-line-strong";

  return (
    <NodeViewWrapper className="template-scale" data-template-type="scale">
      <WorkbookBlock
        kind="척도"
        aside={<span className="text-caption text-muted">독자가 선택</span>}
      >
        {/* 눈금은 독자가 고를 자리입니다. 저작 화면에서는 미리보기만 합니다. */}
        <div
          aria-hidden="true"
          className={scaleGridClass}
          style={scaleGridStyle(steps.length)}
        >
          {steps.map((n) => (
            <span key={n} className={scaleCellClass(false)}>
              {n}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <input
            value={labelMin}
            onChange={(e) => updateAttributes({ labelMin: e.target.value })}
            aria-label="가장 낮은 값의 라벨"
            placeholder="낮음"
            className={labelInput}
          />
          <input
            value={labelMax}
            onChange={(e) => updateAttributes({ labelMax: e.target.value })}
            aria-label="가장 높은 값의 라벨"
            placeholder="높음"
            className={`${labelInput} text-right`}
          />
        </div>
      </WorkbookBlock>
    </NodeViewWrapper>
  );
}
