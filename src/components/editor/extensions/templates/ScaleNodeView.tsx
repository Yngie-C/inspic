import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

export function ScaleNodeView({ node, updateAttributes }: NodeViewProps) {
  const min = parseInt(node.attrs.min as string, 10) || 1;
  const max = parseInt(node.attrs.max as string, 10) || 10;
  const labelMin = (node.attrs.labelMin as string) ?? "낮음";
  const labelMax = (node.attrs.labelMax as string) ?? "높음";

  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <NodeViewWrapper className="template-scale" data-template-type="scale">
      <div className="border border-gray-200 rounded-lg p-4 my-2 bg-white">
        {/* 눈금은 독자가 고를 자리입니다. 저작 화면에서는 미리보기만 합니다. */}
        <div className="flex flex-wrap gap-1 justify-center mb-3">
          {steps.map((n) => (
            <span
              key={n}
              className="flex h-9 w-9 items-center justify-center rounded border border-gray-300 bg-white text-sm text-gray-400"
            >
              {n}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <input
            value={labelMin}
            onChange={(e) => updateAttributes({ labelMin: e.target.value })}
            placeholder="낮음"
            className="w-24 border border-gray-200 rounded px-1 py-0.5 text-xs outline-none"
          />
          <span className="text-gray-400">← 독자가 선택 →</span>
          <input
            value={labelMax}
            onChange={(e) => updateAttributes({ labelMax: e.target.value })}
            placeholder="높음"
            className="w-24 border border-gray-200 rounded px-1 py-0.5 text-xs outline-none text-right"
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
