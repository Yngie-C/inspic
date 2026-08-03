"use client";

import { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { SlashCommand } from "./extensions/SlashCommand";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorToolbar } from "./EditorToolbar";
import { EditorMenuBubble } from "./EditorMenuBubble";
import { BlockExitOnEnter } from "./extensions/BlockExitOnEnter";
import {
  ChecklistNode, CalloutNode, ReflectionNode, SmartGoalNode, ScaleNode,
} from "./extensions/templates";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  content: string;
  onUpdate: (html: string) => void;
  bookId: string;
  chapterId: string;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({
  content,
  onUpdate,
  bookId,
  chapterId,
  placeholder = "내용을 입력하세요...",
  className,
}: RichTextEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the chapterId to detect chapter switches
  const prevChapterRef = useRef<string>(chapterId);
  const imageUploadRef = useRef<(() => void) | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { exitOnTripleEnter: false },
      }),
      BlockExitOnEnter,
      SlashCommand.configure({ imageUploadRef }),
      Underline,
      Highlight.configure({ multicolor: false }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
      ChecklistNode,
      CalloutNode,
      ReflectionNode,
      SmartGoalNode,
      ScaleNode,
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "prose prose-gray max-w-none focus:outline-none min-h-[60vh] text-gray-800 leading-relaxed",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onUpdate(html);
    },
  });

  // When the chapter changes, update editor content
  useEffect(() => {
    if (!editor) return;
    if (prevChapterRef.current !== chapterId) {
      prevChapterRef.current = chapterId;
      // Cancel any pending debounce from previous chapter
      if (debounceRef.current) clearTimeout(debounceRef.current);
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [chapterId, content, editor]);

  // Sync content when it changes externally (e.g. first load)
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    // Only sync if the editor is empty and content is not (avoids cursor jumps)
    if (currentHtml === "<p></p>" && content && content !== "<p></p>") {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  const handleImageUpload = useCallback(async () => {
    if (!editor) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("image", file);

      try {
        // Upload via the cover API pattern — use a generic image upload endpoint
        // For chapter images, encode as base64 data URL (avoids needing a separate endpoint)
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          editor.chain().focus().setImage({ src: dataUrl }).run();
        };
        reader.readAsDataURL(file);
      } catch {
        // silently fail
      }
    };
    input.click();
  }, [editor, bookId, chapterId]);

  useEffect(() => {
    imageUploadRef.current = handleImageUpload;
  }, [handleImageUpload]);

  const wordCount = editor
    ? editor.getText().trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div className={cn("flex flex-col", className)}>
      {editor && (
        <>
          <EditorToolbar editor={editor} onImageUpload={handleImageUpload} />
          <EditorMenuBubble editor={editor} />
        </>
      )}

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <EditorContent
          editor={editor}
          className="min-h-[60vh]"
        />
      </div>

      {/* Word count */}
      <div className="flex justify-end border-t border-gray-100 px-8 py-2">
        <span className="text-xs text-gray-400">{wordCount.toLocaleString()} 단어</span>
      </div>
    </div>
  );
}
