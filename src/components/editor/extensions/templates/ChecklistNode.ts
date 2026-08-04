import { createTemplateNode } from "./BaseTemplateNode";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ChecklistNodeView } from "./ChecklistNodeView";
import type { ChecklistItem } from "@/lib/workbook/types";

/**
 * 새 체크리스트의 첫 항목.
 *
 * 항목의 `id`가 곧 응답의 field_key입니다. 블록 안에서만 고유하면
 * 되므로 첫 항목은 고정 값을 씁니다 — 서로 다른 블록의 "item-1"은
 * block_id가 달라 충돌하지 않습니다.
 */
const DEFAULT_ITEMS: ChecklistItem[] = [{ id: "item-1", text: "항목 1" }];

export const ChecklistNode = createTemplateNode("checklist", "checklist", {
  items: {
    default: JSON.stringify(DEFAULT_ITEMS),
    parseHTML: (el) =>
      el.getAttribute("data-items") || JSON.stringify(DEFAULT_ITEMS),
    renderHTML: (attrs) => ({ "data-items": attrs.items as string }),
  },
}).extend({
  addNodeView() {
    return ReactNodeViewRenderer(ChecklistNodeView);
  },
});
