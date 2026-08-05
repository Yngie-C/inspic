"use client";

import { sanitizeForRender } from "@/lib/sanitize";
import { useMemo } from "react";
import parse, { type DOMNode } from "html-react-parser";
import { isElementNode } from "@/lib/workbook/dom";
import { getTemplateComponent } from "./templates";

/**
 * 챕터 본문을 그립니다. 워크북 블록은 HTML 대신 리더 컴포넌트로 바뀝니다.
 *
 * 활자 크기·테마 옵션은 없습니다. M0에서 리더 설정 기능을 삭제했는데
 * 값만 남아 호출부가 매번 하드코딩한 숫자를 넘기고 있었습니다. 지금은
 * 본문 스타일이 이 컴포넌트 하나에만 있습니다.
 */
interface HtmlContentRendererProps {
  html: string;
  className?: string;
}

export function HtmlContentRenderer({
  html,
  className = "",
}: HtmlContentRendererProps) {
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
          return <Component element={domNode} />;
        },
      }),
    [sanitized],
  );

  return (
    <div className={`reader-content w-full ${className}`}>{content}</div>
  );
}
