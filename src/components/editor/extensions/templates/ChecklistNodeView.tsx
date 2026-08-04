import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { generateFieldKey } from "@/lib/template-node-id";
import { parseChecklistItems } from "@/lib/workbook/extract-blocks";
import type { ChecklistItem } from "@/lib/workbook/types";

export function ChecklistNodeView({ node, updateAttributes }: NodeViewProps) {
  const items: ChecklistItem[] = parseChecklistItems(node.attrs.items as string);

  function setItems(next: ChecklistItem[]) {
    updateAttributes({ items: JSON.stringify(next) });
  }

  function updateText(id: string, text: string) {
    setItems(items.map((item) => (item.id === id ? { ...item, text } : item)));
  }

  // 항목 ID는 여기서 한 번만 부여됩니다. 이 값이 응답의 field_key라서
  // 렌더링이나 파싱 중에 다시 만들면 독자가 체크한 내용이 끊깁니다.
  function addItem() {
    setItems([
      ...items,
      { id: generateFieldKey(), text: `항목 ${items.length + 1}` },
    ]);
  }

  function removeItem(id: string) {
    if (items.length === 1) return;
    setItems(items.filter((item) => item.id !== id));
  }

  return (
    <NodeViewWrapper
      className="template-checklist my-3 rounded-lg border border-gray-200 bg-white p-4"
      data-template-type="checklist"
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        체크리스트
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            {/* 체크는 독자가 합니다. 저작 화면에서는 모양만 보여줍니다. */}
            <span
              aria-hidden="true"
              className="h-4 w-4 flex-shrink-0 rounded border border-gray-300 bg-gray-50"
            />
            <input
              type="text"
              value={item.text}
              onChange={(e) => updateText(item.id, e.target.value)}
              className="flex-1 border-none bg-transparent text-sm text-gray-800 outline-none"
              placeholder="항목 텍스트"
            />
            <button
              onClick={() => removeItem(item.id)}
              className="flex-shrink-0 text-gray-300 hover:text-red-400"
              title="삭제"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={addItem}
        className="mt-3 flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700"
      >
        <span className="text-base font-bold">+</span> 항목 추가
      </button>
    </NodeViewWrapper>
  );
}
