import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  WorkbookBlock,
  scaleCellClass,
  scaleGridClass,
  scaleGridStyle,
} from "@/components/ui/workbook-block";
import { scaleRange, scaleSteps } from "@/lib/workbook/block-config";

export function ScaleNodeView({ node, updateAttributes }: NodeViewProps) {
  // 리더·추출기·저장 라우트와 같은 해석입니다. `|| 1`은 0을 1로 바꿨고,
  // 범위를 검사하지 않아 큰 max면 에디터가 멈췄습니다(코드 리뷰 4-P1-7).
  const range = scaleRange(node.attrs.min, node.attrs.max);
  const labelMin = (node.attrs.labelMin as string) ?? "낮음";
  const labelMax = (node.attrs.labelMax as string) ?? "높음";

  const steps = scaleSteps(range);
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
