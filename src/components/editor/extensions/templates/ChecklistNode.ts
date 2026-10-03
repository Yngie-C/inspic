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
    // 새로 넣는 블록만 첫 항목을 받습니다. 불러온 HTML에 `data-items`가
    // 없으면 빈 목록입니다 — 여기서 "항목 1"을 지어내면 저자가 쓴 적 없는
    // 문항이 다음 저장에 동기화되고 검수도 통과합니다(4-P1-2).
    parseHTML: (el) => el.getAttribute("data-items") ?? "[]",
    renderHTML: (attrs) => ({ "data-items": attrs.items as string }),
  },
}).extend({
  addNodeView() {
    return ReactNodeViewRenderer(ChecklistNodeView);
  },
});
