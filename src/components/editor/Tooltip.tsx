"use client";

import { useState, useRef, useEffect, useId, useCallback } from "react";
import { createPortal } from "react-dom";

// OS 감지
const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

// 단축키 기호 변환
function formatShortcut(shortcut: string): string {
  return shortcut
    .replace(/mod/g, isMac ? "⌘" : "Ctrl")
    .replace(/Alt/g, isMac ? "⌥" : "Alt")
    .replace(/Shift/g, "⇧")
    .replace(/\+/g, "");
}

// 단축키 매핑 (export for reuse)
export const SHORTCUTS: Record<string, string> = {
  bold: "mod+B",
  italic: "mod+I",
  underline: "mod+U",
  heading1: "mod+Alt+1",
  heading2: "mod+Alt+2",
  heading3: "mod+Alt+3",
  bulletList: "mod+Shift+8",
  orderedList: "mod+Shift+7",
  blockquote: "mod+Shift+B",
  code: "mod+E",
  codeBlock: "mod+Alt+C",
  link: "mod+K",
};

interface TooltipProps {
  children: React.ReactNode;
  label: string;
  shortcut?: string;
  side?: "top" | "bottom";
  delayMs?: number;
}

export function Tooltip({
  children,
  label,
  shortcut,
  side = "bottom",
  delayMs = 500,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const show = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();

    // Tooltip dimensions estimate before render
    const tooltipWidth = 120;
    const tooltipHeight = 28;
    const gap = 4;

    let top: number;
    if (side === "bottom") {
      top = rect.bottom + gap;
    } else {
      top = rect.top - tooltipHeight - gap;
    }

    const rawLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - tooltipWidth - 8));

    setPosition({ top, left });
    setVisible(true);
  }, [side]);

  const handleMouseEnter = useCallback(() => {
    timeoutRef.current = setTimeout(show, delayMs);
  }, [show, delayMs]);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setVisible(false);
  }, []);

  // Recalculate position after tooltip mounts to use real width
  useEffect(() => {
    if (visible && tooltipRef.current && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const tooltipWidth = tooltipRef.current.offsetWidth;
      const tooltipHeight = tooltipRef.current.offsetHeight;
      const gap = 4;

      let top: number;
      if (side === "bottom") {
        top = rect.bottom + gap;
      } else {
        top = rect.top - tooltipHeight - gap;
      }

      const rawLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
      const left = Math.max(8, Math.min(rawLeft, window.innerWidth - tooltipWidth - 8));

      setPosition({ top, left });
    }
  }, [visible, side]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        aria-describedby={visible ? id : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex"
      >
        {children}
      </span>
      {visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tooltipRef}
            id={id}
            role="tooltip"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              zIndex: 9999,
              pointerEvents: "none",
            }}
            className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-on-accent shadow-float whitespace-nowrap"
          >
            <span>{label}</span>
            {shortcut && (
              <kbd className="ml-1 rounded bg-primary px-1 py-0.5 font-mono text-[10px] text-faint">
                {formatShortcut(shortcut)}
              </kbd>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
