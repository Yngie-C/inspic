"use client";

import type { Element } from "html-react-parser";

/**
 * `data-template-type` → 리더 컴포넌트.
 *
 * 각 템플릿 모듈이 import될 때 자기 자신을 등록합니다 (`./index.ts` 참조).
 * 컴포넌트가 받는 것은 파싱된 엘리먼트 하나뿐입니다 — 문항은 거기
 * `data-*`에 실려 있고, 응답은 `WorkbookResponsesProvider`에서 옵니다.
 */
const TEMPLATE_REGISTRY: Record<
  string,
  React.ComponentType<{ element: Element }>
> = {};

export function registerTemplate(
  type: string,
  Component: React.ComponentType<{ element: Element }>,
) {
  TEMPLATE_REGISTRY[type] = Component;
}

/**
 * 등록된 컴포넌트를 돌려줍니다. 없으면 null — 호출부가 원본 HTML을
 * 그대로 그립니다.
 */
export function getTemplateComponent(
  templateType: string,
): React.ComponentType<{ element: Element }> | null {
  return TEMPLATE_REGISTRY[templateType] ?? null;
}
