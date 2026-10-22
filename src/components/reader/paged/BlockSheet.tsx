"use client";

import { createElement, useEffect, useMemo, useRef } from "react";
import type { Element } from "html-react-parser";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTemplateComponent } from "../templates";
import { useBlockAnswers } from "../templates/useBlockAnswers";

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** 열 때 먼저 갈 곳: 쓸 수 있는 칸, 없으면 패널. */
const FIRST_FIELD =
  "textarea:not([readonly]), input:not([disabled]), button[aria-pressed]";

/**
 * 워크북 카드를 눌렀을 때 뜨는 쓰기 시트. 모바일은 아래에서, 데스크톱은
 * 가운데에 뜹니다.
 *
 * 안에는 스크롤 리더와 같은 블록 템플릿을 그대로 그립니다. 저장 경로는
 * 템플릿 → `WorkbookResponsesProvider` 하나라서, 이 시트를 provider 밖에서
 * 그리면 템플릿이 던집니다.
 */
export function BlockSheet({
  element,
  onClose,
}: {
  element: Element;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const block = useBlockAnswers(element.attribs["data-node-id"] || "");
  const content = useMemo(() => {
    const Component = getTemplateComponent(element.attribs["data-template-type"] ?? "");
    // 레지스트리에서 찾은 컴포넌트입니다. 렌더마다 새로 만드는 것이 아닙니다.
    return Component ? createElement(Component, { element }) : null;
  }, [element]);

  // 포커스: 열 때 안으로, Tab은 안에서만 돌고, 닫으면 연 버튼으로.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.querySelector<HTMLElement>(FIRST_FIELD);
    (first ?? panel).focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const head = focusables[0];
      const tail = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === head || active === panel)) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && active === tail) {
        event.preventDefault();
        head.focus();
      } else if (!panel.contains(active)) {
        event.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
    };
  }, [onClose]);

  // 배경 스크롤 잠금.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // iOS Safari는 키보드가 올라와도 레이아웃 뷰포트를 줄이지 않아서, 아래에
  // 붙인 시트가 키보드 뒤로 숨습니다. 보이는 영역(visualViewport)의 아래
  // 끝에 맞춥니다. 렌더를 거치지 않게 CSS 변수로 바로 씁니다.
  useEffect(() => {
    const panel = panelRef.current;
    const viewport = window.visualViewport;
    if (!panel || !viewport) return;
    const fit = () => {
      const hidden = window.innerHeight - (viewport.height + viewport.offsetTop);
      panel.style.setProperty("--sheet-bottom", `${Math.max(0, hidden)}px`);
      panel.style.setProperty("--sheet-max-height", `${viewport.height * 0.85}px`);
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
    };
  }, []);

  if (!content) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 bg-[rgba(0,0,0,0.4)]"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={block.canWrite ? "워크북 쓰기" : "워크북 보기"}
        tabIndex={-1}
        className={cn(
          "absolute flex flex-col border border-line bg-surface shadow-float outline-none",
          "max-[600px]:inset-x-0 max-[600px]:bottom-[var(--sheet-bottom,0px)] max-[600px]:max-h-[var(--sheet-max-height,85dvh)] max-[600px]:rounded-t-lg",
          "min-[601px]:left-1/2 min-[601px]:top-1/2 min-[601px]:max-h-[80dvh] min-[601px]:w-[min(560px,calc(100%-32px))] min-[601px]:-translate-x-1/2 min-[601px]:-translate-y-1/2 min-[601px]:rounded-lg",
        )}
      >
        <div className="flex flex-none items-center justify-between gap-3 border-b border-line px-5 py-3">
          {/* 쓸 수 없는 이유는 블록 안의 안내(BlockLockNotice)가 말합니다. */}
          <p className="m-0 text-caption text-muted">
            {block.canWrite && "쓰는 대로 저장돼요"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1.5 rounded-md p-1.5 text-primary hover:bg-mark"
            aria-label="닫기"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 text-body-reader">
          {content}
        </div>
      </div>
    </div>
  );
}
