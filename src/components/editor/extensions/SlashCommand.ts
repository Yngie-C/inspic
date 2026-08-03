import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import {
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  List,
  ListOrdered,
  Minus,
  Image as ImageIcon,
  CheckSquare,
  MessageSquare,
  HelpCircle,
  ChevronDown,
  Columns,
  Target,
  ArrowLeftRight,
  BarChart3,
  LayoutGrid,
  Flag,
  Calendar,
  Star,
} from "lucide-react";
import { SlashCommandMenu, type SlashMenuItem, type SlashCommandMenuHandle } from "../SlashCommandMenu";
import type React from "react";

const SLASH_ITEMS: SlashMenuItem[] = [
  {
    title: "제목 1",
    aliases: ["h1", "heading1", "제목"],
    icon: Heading1,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: "제목 2",
    aliases: ["h2", "heading2", "제목2"],
    icon: Heading2,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: "제목 3",
    aliases: ["h3", "heading3", "제목3"],
    icon: Heading3,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: "인용문",
    aliases: ["quote", "blockquote", "인용"],
    icon: Quote,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "코드 블록",
    aliases: ["code", "codeblock", "코드"],
    icon: Code,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "글머리 기호 목록",
    aliases: ["ul", "bullet", "list", "목록"],
    icon: List,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "번호 목록",
    aliases: ["ol", "ordered", "number", "번호"],
    icon: ListOrdered,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "구분선",
    aliases: ["hr", "divider", "horizontal", "구분"],
    icon: Minus,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "이미지 삽입",
    aliases: ["image", "img", "이미지", "사진"],
    icon: ImageIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const ref = (
        editor.extensionManager.extensions.find(
          (ext) => ext.name === "slashCommand"
        )?.options as { imageUploadRef?: React.RefObject<(() => void) | null> }
      )?.imageUploadRef;
      ref?.current?.();
    },
  },
  // — 인터랙티브 템플릿 —
  {
    title: "체크리스트",
    aliases: ["checklist", "체크", "할일"],
    icon: CheckSquare,
    category: "인터랙티브",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({ type: "checklist" }).run();
    },
  },
  {
    title: "콜아웃",
    aliases: ["callout", "알림", "안내"],
    icon: MessageSquare,
    category: "인터랙티브",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({ type: "callout" }).run();
    },
  },
  {
    title: "리플렉션 프롬프트",
    aliases: ["reflection", "질문", "성찰"],
    icon: HelpCircle,
    category: "인터랙티브",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({ type: "reflection" }).run();
    },
  },
  {
    title: "SMART 목표",
    aliases: ["smart", "goal", "목표"],
    icon: Target,
    category: "인터랙티브",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({ type: "smartGoal" }).run();
    },
  },
  {
    title: "1-10 스케일",
    aliases: ["scale", "스케일", "척도", "점수"],
    icon: BarChart3,
    category: "인터랙티브",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({ type: "scale" }).run();
    },
  },
];

export interface SlashCommandOptions {
  imageUploadRef: React.RefObject<(() => void) | null>;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      imageUploadRef: { current: null },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        startOfLine: true,
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          if (!q) return SLASH_ITEMS;
          return SLASH_ITEMS.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.aliases.some((alias) => alias.toLowerCase().includes(q))
          );
        },
        render: () => {
          let component: ReactRenderer<any> | null = null;
          let popup: HTMLDivElement | null = null;

          return {
            onStart: (props: any) => {
              popup = document.createElement("div");
              popup.style.position = "fixed";
              popup.style.zIndex = "100";
              document.body.appendChild(popup);

              component = new ReactRenderer(SlashCommandMenu, {
                props: { ...props, items: props.items },
                editor: props.editor,
              });

              popup.appendChild(component.element);

              const rect = props.clientRect?.();
              if (rect && popup) {
                const menuHeight = 300;
                const spaceBelow = window.innerHeight - rect.bottom;
                if (spaceBelow < menuHeight && rect.top > menuHeight) {
                  popup.style.top = `${rect.top - menuHeight}px`;
                } else {
                  popup.style.top = `${rect.bottom + 4}px`;
                }
                popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 280))}px`;
              }
            },
            onUpdate: (props: any) => {
              component?.updateProps({ ...props, items: props.items });

              const rect = props.clientRect?.();
              if (rect && popup) {
                const menuHeight = 300;
                const spaceBelow = window.innerHeight - rect.bottom;
                if (spaceBelow < menuHeight && rect.top > menuHeight) {
                  popup.style.top = `${rect.top - menuHeight}px`;
                } else {
                  popup.style.top = `${rect.bottom + 4}px`;
                }
                popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 280))}px`;
              }
            },
            onKeyDown: (props: any) => {
              if (props.event.key === "Escape") {
                return false; // Let Suggestion handle it — onExit will fire and clean up
              }
              return (component?.ref as SlashCommandMenuHandle | null)?.onKeyDown?.(props) ?? false;
            },
            onExit: () => {
              popup?.remove();
              component?.destroy();
            },
          };
        },
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range });
        },
      }),
    ];
  },
});
