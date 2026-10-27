"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Superscript,
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
  Plus,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, SHORTCUTS } from "./Tooltip";
import { WORKBOOK_BLOCKS, insertWorkbookBlock } from "./workbook-blocks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
        isActive && "bg-primary text-on-primary hover:bg-primary hover:text-on-primary",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px bg-line shrink-0" />;
}

/**
 * 워크북 블록 삽입 메뉴. 슬래시 메뉴만 있을 때는 처음 쓰는 저자가 블록이
 * 있다는 것조차 몰랐습니다(TODO 2-1). 아이콘 줄에서 글자가 있는 유일한
 * 버튼이라 눈에 띄고, accent는 화면의 주요 행동([공개하기]) 몫이라 쓰지 않습니다.
 */
function WorkbookBlockMenu({ editor }: { editor: Editor }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // 에디터 포커스를 지켜 커서 자리를 잃지 않게 합니다(ToolbarButton과 같은 이유).
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "mr-1 flex h-8 shrink-0 items-center gap-1 rounded-md border border-line-strong px-2.5",
            "text-body-sm font-semibold text-primary transition-colors duration-150 ease-out",
            "hover:border-primary data-[state=open]:border-primary",
          )}
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          워크북 블록
          <ChevronDown className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72"
        // 메뉴가 닫힐 때 포커스를 트리거로 돌리지 않습니다. 고른 블록 쪽으로
        // insertWorkbookBlock()이 에디터 포커스를 되돌립니다.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {WORKBOOK_BLOCKS.map((block) => {
          const Icon = block.icon;
          return (
            <DropdownMenuItem
              key={block.type}
              className="items-start gap-3 px-2.5 py-2"
              onSelect={() => insertWorkbookBlock(editor, block.type)}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
              <div className="min-w-0">
                <div className="font-semibold">{block.title}</div>
                <div className="text-caption text-muted">{block.description}</div>
              </div>
            </DropdownMenuItem>
          );
        })}
        <p className="border-t border-line px-2.5 pt-2 pb-1.5 mt-1 text-caption text-muted">
          본문 빈 줄에서 /를 입력해도 넣을 수 있어요
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface EditorToolbarProps {
  editor: Editor;
  onImageUpload?: () => void;
  className?: string;
}

/**
 * 툴바 버튼의 켜짐 상태. Tiptap 3의 `useEditor`는 트랜잭션마다 다시 그리지 않아서,
 * 렌더 중에 `editor.isActive()`를 읽으면 커서를 굵은 글씨·링크·제목으로 옮겨도
 * 버튼이 켜지지 않습니다(코드 리뷰 12-P2-2). 이 값들만 구독해, 바뀔 때만 툴바를
 * 다시 그립니다 — 에디터 전체를 키마다 다시 그리는 `shouldRerenderOnTransaction`은
 * 쓰지 않습니다.
 */
function useToolbarState(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive("bold"),
      italic: ed.isActive("italic"),
      underline: ed.isActive("underline"),
      code: ed.isActive("code"),
      superscript: ed.isActive("superscript"),
      strike: ed.isActive("strike"),
      highlight: ed.isActive("highlight"),
      heading1: ed.isActive("heading", { level: 1 }),
      heading2: ed.isActive("heading", { level: 2 }),
      heading3: ed.isActive("heading", { level: 3 }),
      bulletList: ed.isActive("bulletList"),
      orderedList: ed.isActive("orderedList"),
      blockquote: ed.isActive("blockquote"),
      codeBlock: ed.isActive("codeBlock"),
      link: ed.isActive("link"),
      alignLeft: ed.isActive({ textAlign: "left" }),
      alignCenter: ed.isActive({ textAlign: "center" }),
      alignRight: ed.isActive({ textAlign: "right" }),
    }),
  });
}

export function EditorToolbar({ editor, onImageUpload, className }: EditorToolbarProps) {
  const active = useToolbarState(editor);

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
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5 border-b border-line bg-paper px-3 py-2 overflow-x-auto",
        className,
      )}
    >
      {/* Text formatting */}
      <Tooltip label="굵게" shortcut={SHORTCUTS.bold}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={active.bold}
          title="굵게 (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="기울임" shortcut={SHORTCUTS.italic}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={active.italic}
          title="기울임 (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="밑줄" shortcut={SHORTCUTS.underline}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={active.underline}
          title="밑줄 (Ctrl+U)"
        >
          <Underline className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="인라인 코드" shortcut={SHORTCUTS.code}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={active.code}
          title="인라인 코드 (Ctrl+E)"
        >
          <Code2 className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="위 첨자" shortcut={SHORTCUTS.superscript}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          isActive={active.superscript}
          title="위 첨자 (Ctrl+.)"
        >
          <Superscript className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      {/* <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={active.strike}
        title="취소선"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={active.highlight}
        title="형광펜"
      >
        <Highlighter className="h-4 w-4" />
      </ToolbarButton> */}

      <ToolbarDivider />

      {/* Headings */}
      <Tooltip label="제목 1" shortcut={SHORTCUTS.heading1}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={active.heading1}
          title="제목 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="제목 2" shortcut={SHORTCUTS.heading2}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={active.heading2}
          title="제목 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="제목 3" shortcut={SHORTCUTS.heading3}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={active.heading3}
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
          isActive={active.bulletList}
          title="글머리 기호 목록"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="번호 목록" shortcut={SHORTCUTS.orderedList}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={active.orderedList}
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
          isActive={active.blockquote}
          title="인용구"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="코드 블록" shortcut={SHORTCUTS.codeBlock}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={active.codeBlock}
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
          isActive={active.link}
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
          isActive={active.alignLeft}
          title="왼쪽 정렬"
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="가운데 정렬">
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          isActive={active.alignCenter}
          title="가운데 정렬"
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label="오른쪽 정렬">
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          isActive={active.alignRight}
          title="오른쪽 정렬"
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
      </Tooltip>

      <ToolbarDivider />

      <WorkbookBlockMenu editor={editor} />
    </div>
  );
}
