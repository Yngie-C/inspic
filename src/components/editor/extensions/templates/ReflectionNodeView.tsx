import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { WorkbookBlock, blockFieldClass } from "@/components/ui/workbook-block";
import { cn } from "@/lib/utils";

export function ReflectionNodeView({ node, updateAttributes }: NodeViewProps) {
  const prompt =
    (node.attrs.prompt as string) ?? "이 챕터에서 가장 인상 깊었던 점은?";
  const placeholder =
    (node.attrs.placeholder as string) ?? "여기에 답변을 작성하세요...";

  return (
    <NodeViewWrapper className="template-reflection" data-template-type="reflection">
      <WorkbookBlock
        kind="성찰"
        aside={<span className="text-caption text-muted">독자가 작성</span>}
      >
        <input
          type="text"
          value={prompt}
          onChange={(e) => updateAttributes({ prompt: e.target.value })}
          aria-label="성찰 질문"
          className="w-full rounded-sm bg-transparent text-subtitle text-primary placeholder:text-muted"
          placeholder="질문을 입력하세요"
        />
        {/* 답 칸은 독자가 채웁니다. 안내 문구만 여기서 고칩니다. */}
        <input
          type="text"
          value={placeholder}
          onChange={(e) => updateAttributes({ placeholder: e.target.value })}
          aria-label="응답 안내 문구"
          className={cn(blockFieldClass, "text-muted")}
          placeholder="응답 안내 문구 (placeholder)"
        />
      </WorkbookBlock>
    </NodeViewWrapper>
  );
}
