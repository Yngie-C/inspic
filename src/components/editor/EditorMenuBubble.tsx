"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Bold, Italic, Link, Highlighter, Code2, Heading1, Heading2, Heading3, Quote, Code, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, SHORTCUTS } from "./Tooltip";

interface BubbleButtonProps {
  onClick: () => void;
  isActive?: boolean;
  title: string;
  children: React.ReactNode;
}

function BubbleButton({ onClick, isActive, title, children }: BubbleButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded transition-colors",
        "text-primary hover:bg-mark",
        isActive && "bg-primary text-on-primary hover:bg-primary",
      )}
    >
      {children}
    </button>
  );
}

interface EditorMenuBubbleProps {
  editor: Editor;
}

interface BubblePos {
  top: number;
  left: number;
}

export function EditorMenuBubble({ editor }: EditorMenuBubbleProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<BubblePos>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateBubble = () => {
      const { state, view } = editor;
      const { selection } = state;
      const { empty } = selection;

      if (empty || !view.hasFocus()) {
        setVisible(false);
        return;
      }

      // Get selection bounding rect
      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) {
        setVisible(false);
        return;
      }

      const range = domSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (rect.width === 0) {
        setVisible(false);
        return;
      }

      const menuWidth = menuRef.current?.offsetWidth || 156;
      const menuHeight = 36;
      const gap = 8;

      const calculatedLeft = rect.left + rect.width / 2 - menuWidth / 2;
      const left = Math.max(8, Math.min(calculatedLeft, window.innerWidth - menuWidth - 8));
      let top = rect.top - menuHeight - gap;
      if (top < 8) {
        top = rect.bottom + gap;
      }

      setPos({ top, left });
      setVisible(true);
    };

    const handleBlur = () => setVisible(false);

    // Listen to editor selection changes
    editor.on("selectionUpdate", updateBubble);
    editor.on("blur", handleBlur);

    // Also listen to mouse up for initial selection
    document.addEventListener("mouseup", updateBubble);
    document.addEventListener("keyup", updateBubble);

    return () => {
      editor.off("selectionUpdate", updateBubble);
      editor.off("blur", handleBlur);
      document.removeEventListener("mouseup", updateBubble);
      document.removeEventListener("keyup", updateBubble);
    };
  }, [editor]);

  const addLink = () => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL을 입력하세요:", previousUrl ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      style={{ top: pos.top, left: pos.left, scrollbarWidth: "none", msOverflowStyle: "none" }}
      className="fixed z-50 rounded-lg border border-line bg-surface px-1.5 py-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex items-center gap-0.5">
        <Tooltip label="굵게" shortcut={SHORTCUTS.bold} side="top">
          <BubbleButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
            title="굵게"
          >
            <Bold className="h-3.5 w-3.5" />
          </BubbleButton>
        </Tooltip>
        <Tooltip label="기울임" shortcut={SHORTCUTS.italic} side="top">
          <BubbleButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
            title="기울임"
          >
            <Italic className="h-3.5 w-3.5" />
          </BubbleButton>
        </Tooltip>
        <Tooltip label="형광펜" side="top">
          <BubbleButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            isActive={editor.isActive("highlight")}
            title="형광펜"
          >
            <Highlighter className="h-3.5 w-3.5" />
          </BubbleButton>
        </Tooltip>
        <Tooltip label="인라인 코드" shortcut={SHORTCUTS.code} side="top">
          <BubbleButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive("code")}
            title="인라인 코드"
          >
            <Code2 className="h-3.5 w-3.5" />
          </BubbleButton>
        </Tooltip>
        <div className="mx-0.5 h-4 w-px bg-line shrink-0" />
        <Tooltip label="링크" shortcut={SHORTCUTS.link} side="top">
          <BubbleButton
            onClick={addLink}
            isActive={editor.isActive("link")}
            title="링크"
          >
            <Link className="h-3.5 w-3.5" />
          </BubbleButton>
        </Tooltip>
        {/* Block format divider */}
        <div className="mx-0.5 h-4 w-px bg-line shrink-0" />
        {/* Block format buttons */}
        <Tooltip label="제목 1" shortcut={SHORTCUTS.heading1} side="top">
          <BubbleButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive("heading", { level: 1 })}
            title="제목 1"
          >
            <Heading1 className="h-3.5 w-3.5" />
          </BubbleButton>
        </Tooltip>
        <Tooltip label="제목 2" shortcut={SHORTCUTS.heading2} side="top">
          <BubbleButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive("heading", { level: 2 })}
            title="제목 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </BubbleButton>
        </Tooltip>
        <Tooltip label="제목 3" shortcut={SHORTCUTS.heading3} side="top">
          <BubbleButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive("heading", { level: 3 })}
            title="제목 3"
          >
            <Heading3 className="h-3.5 w-3.5" />
          </BubbleButton>
        </Tooltip>
        <Tooltip label="인용문" shortcut={SHORTCUTS.blockquote} side="top">
          <BubbleButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive("blockquote")}
            title="인용문"
          >
            <Quote className="h-3.5 w-3.5" />
          </BubbleButton>
        </Tooltip>
        <Tooltip label="코드 블록" shortcut={SHORTCUTS.codeBlock} side="top">
          <BubbleButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            isActive={editor.isActive("codeBlock")}
            title="코드 블록"
          >
            <Code className="h-3.5 w-3.5" />
          </BubbleButton>
        </Tooltip>
        <Tooltip label="글머리 기호 목록" shortcut={SHORTCUTS.bulletList} side="top">
          <BubbleButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive("bulletList")}
            title="글머리 기호 목록"
          >
            <List className="h-3.5 w-3.5" />
          </BubbleButton>
        </Tooltip>
        <Tooltip label="번호 목록" shortcut={SHORTCUTS.orderedList} side="top">
          <BubbleButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive("orderedList")}
            title="번호 목록"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </BubbleButton>
        </Tooltip>
      </div>
    </div>
  );
}
