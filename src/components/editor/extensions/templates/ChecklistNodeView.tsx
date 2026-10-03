import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Plus, X } from "lucide-react";
import { WorkbookBlock } from "@/components/ui/workbook-block";
import { generateFieldKey } from "@/lib/template-node-id";
import {
  isChecklistItemsIntact,
  parseChecklistItems,
} from "@/lib/workbook/extract-blocks";
import type { ChecklistItem } from "@/lib/workbook/types";

export function ChecklistNodeView({ node, updateAttributes }: NodeViewProps) {
  const raw = node.attrs.items as string;
  const items: ChecklistItem[] = parseChecklistItems(raw);
  // 읽은 목록이 원문을 다 담지 못하면(깨진 JSON 등) 편집을 막습니다. 이
  // 목록으로 다시 쓰면 읽지 못한 항목이 HTML에서 영구히 지워집니다(4-P1-3).
  const intact = isChecklistItemsIntact(raw);

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

  // 저자가 알고 고를 때만 원문을 버립니다.
  function startOver() {
    setItems([{ id: generateFieldKey(), text: "항목 1" }]);
  }

  if (!intact) {
    return (
      <NodeViewWrapper className="template-checklist" data-template-type="checklist">
        <WorkbookBlock kind="체크리스트">
          <p className="m-0 text-body-sm text-muted">
            이 체크리스트는 항목 형식이 깨져 있어 편집할 수 없어요. 원래 항목은
            지우지 않고 그대로 두었어요. 새로 쓰려면 항목을 비우고 다시
            시작하세요.
          </p>
          <button
            type="button"
            onClick={startOver}
            className="self-start rounded-sm text-button text-primary underline-offset-[3px] hover:underline"
          >
            항목 비우고 다시 쓰기
          </button>
        </WorkbookBlock>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="template-checklist" data-template-type="checklist">
      <WorkbookBlock
        kind="체크리스트"
        aside={
          <span className="text-caption tabular-nums text-muted">
            항목 {items.length}개
          </span>
        }
      >
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item) => (
            <li key={item.id} className="m-0 flex items-center gap-2.5">
              {/* 체크는 독자가 합니다. 저작 화면에서는 모양만 보여줍니다. */}
              <span
                aria-hidden="true"
                className="h-[18px] w-[18px] flex-none rounded-xs border border-field-line bg-field"
              />
              <input
                type="text"
                value={item.text}
                onChange={(e) => updateText(item.id, e.target.value)}
                aria-label="체크리스트 항목"
                className="flex-1 rounded-sm bg-transparent text-body text-primary placeholder:text-muted"
                placeholder="항목 텍스트"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                disabled={items.length === 1}
                className="flex-none rounded-sm p-0.5 text-muted transition-colors duration-150 ease-out hover:text-danger disabled:cursor-not-allowed disabled:text-faint disabled:hover:text-faint"
                aria-label={`${item.text} 삭제`}
                title="삭제"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 self-start rounded-sm text-button text-primary underline-offset-[3px] hover:underline"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          항목 추가
        </button>
      </WorkbookBlock>
    </NodeViewWrapper>
  );
}
