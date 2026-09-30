"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Code2,
  Image as ImageIcon,
  Link,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, SHORTCUTS } from "./Tooltip";

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  title,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      title={title}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded transition-colors",
        "text-muted hover:bg-mark hover:text-primary",
        "disabled:pointer-events-none disabled:opacity-40",
        isActive && "bg-primary text-on-accent hover:bg-primary hover:text-on-accent",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px bg-line shrink-0" />;
}

interface EditorToolbarProps {
  editor: Editor;
  onImageUpload?: () => void;
}

export function EditorToolbar({ editor, onImageUpload }: EditorToolbarProps) {
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

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-paper px-3 py-2 overflow-x-auto">
      {/* Text formatting */}
      <Tooltip label="굵게" shortcut={SHORTCUTS.bold}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="굵게 (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="기울임" shortcut={SHORTCUTS.italic}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="기울임 (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="밑줄" shortcut={SHORTCUTS.underline}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title="밑줄 (Ctrl+U)"
        >
          <Underline className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="인라인 코드" shortcut={SHORTCUTS.code}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive("code")}
          title="인라인 코드 (Ctrl+E)"
        >
          <Code2 className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      {/* <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        title="취소선"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={editor.isActive("highlight")}
        title="형광펜"
      >
        <Highlighter className="h-4 w-4" />
      </ToolbarButton> */}

      <ToolbarDivider />

      {/* Headings */}
      <Tooltip label="제목 1" shortcut={SHORTCUTS.heading1}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          title="제목 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="제목 2" shortcut={SHORTCUTS.heading2}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="제목 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="제목 3" shortcut={SHORTCUTS.heading3}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          title="제목 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>

      <ToolbarDivider />

      {/* Lists */}
      <Tooltip label="글머리 기호 목록" shortcut={SHORTCUTS.bulletList}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="글머리 기호 목록"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="번호 목록" shortcut={SHORTCUTS.orderedList}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="번호 목록"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>

      <ToolbarDivider />

      {/* Block */}
      <Tooltip label="인용구" shortcut={SHORTCUTS.blockquote}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          title="인용구"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="코드 블록" shortcut={SHORTCUTS.codeBlock}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          title="코드 블록"
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>

      <ToolbarDivider />

      {/* Insert */}
      {onImageUpload && (
        <Tooltip label="이미지 삽입">
          <ToolbarButton onClick={onImageUpload} title="이미지 삽입">
            <ImageIcon className="h-4 w-4" />
          </ToolbarButton>
        </Tooltip>
      )}
      <Tooltip label="링크 삽입" shortcut={SHORTCUTS.link}>
        <ToolbarButton
          onClick={addLink}
          isActive={editor.isActive("link")}
          title="링크 삽입"
        >
          <Link className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>

      <ToolbarDivider />

      {/* Alignment */}
      <Tooltip label="왼쪽 정렬">
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          isActive={editor.isActive({ textAlign: "left" })}
          title="왼쪽 정렬"
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="가운데 정렬">
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          isActive={editor.isActive({ textAlign: "center" })}
          title="가운데 정렬"
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="오른쪽 정렬">
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          isActive={editor.isActive({ textAlign: "right" })}
          title="오른쪽 정렬"
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
    </div>
  );
}
