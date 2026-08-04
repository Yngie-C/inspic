"use client";

import { sanitizeForRender } from "@/lib/sanitize";
import type { ReaderTheme } from "@/types";
import { useMemo } from "react";
import parse, { type DOMNode } from "html-react-parser";
import { isElementNode } from "@/lib/workbook/dom";
import { getTemplateComponent } from "./templates";

interface HtmlContentRendererProps {
  html: string;
  theme: ReaderTheme;
  fontSize: number;
  lineHeight: number;
  className?: string;
  chapterId?: string;
}

const themeClasses: Record<ReaderTheme, string> = {
  light: "bg-white text-gray-900",
  dark: "bg-gray-950 text-gray-100",
  sepia: "bg-amber-50 text-amber-950",
};

export function HtmlContentRenderer({
  html,
  theme,
  fontSize,
  lineHeight,
  className = "",
  chapterId = "",
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
          return <Component element={domNode} chapterId={chapterId} />;
        },
      }),
    [sanitized, chapterId]
  );

  return (
    <div
      className={[
        "reader-content w-full h-full",
        themeClasses[theme],
        className,
      ].join(" ")}
      style={{ fontSize: `${fontSize}px`, lineHeight }}
    >
      {content}
    </div>
  );
}
