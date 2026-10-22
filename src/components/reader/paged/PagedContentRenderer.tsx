"use client";

import { useMemo } from "react";
import parse, { type DOMNode, type Element } from "html-react-parser";
import { sanitizeForRender } from "@/lib/sanitize";
import { isElementNode } from "@/lib/workbook/dom";
import { getTemplateComponent } from "../templates";
import { BlockCard } from "./BlockCard";
import { CARD_BLOCK_TYPES } from "./card-summary";

/**
 * 쪽 넘김 리더의 본문. `HtmlContentRenderer`와 같은 틀이고, 입력을 받는
 * 워크북 블록만 카드로 바꿉니다. 쪽 안에는 입력을 두지 않습니다 — 입력이
 * 자라면 쪽을 다시 나누고, iOS Safari에서는 키보드와 고정 높이 화면이
 * 부딪혀 블록이 깨졌습니다(`docs/agent-knowledge/paged-reader-decision.md`).
 */
export function PagedContentRenderer({
  html,
  onOpenBlock,
}: {
  html: string;
  onOpenBlock: (element: Element) => void;
}) {
  const sanitized = useMemo(() => sanitizeForRender(html), [html]);

  const content = useMemo(
    () =>
      parse(sanitized, {
        replace(domNode: DOMNode) {
          if (!isElementNode(domNode)) return;
          const templateType = domNode.attribs?.["data-template-type"];
          if (!templateType) return;

          const Component = getTemplateComponent(templateType);
          if (!Component) {
            console.warn(`Unknown template type: ${templateType}`);
            return; // render original HTML as-is
          }
          if (CARD_BLOCK_TYPES.has(templateType)) {
            return (
              <BlockCard element={domNode} type={templateType} onOpen={onOpenBlock} />
            );
          }
          return <Component element={domNode} />;
        },
      }),
    [sanitized, onOpenBlock],
  );

  return <div className="reader-content w-full">{content}</div>;
}
