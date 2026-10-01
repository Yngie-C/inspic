"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
  placeholder = "내용을 입력하세요",
  className,
}: RichTextEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the chapterId to detect chapter switches
  const prevChapterRef = useRef<string>(chapterId);
  const imageUploadRef = useRef<(() => void) | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

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
          "prose prose-gray max-w-none focus:outline-none min-h-[60vh] text-primary leading-relaxed",
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

  /**
   * 본문 이미지는 Storage에 올리고 URL만 문서에 넣습니다.
   *
   * base64로 인라인하면 이미지 한 장이 본문 HTML을 수십 KB씩 부풀려
   * `content_html`의 500,000자 제한에 금방 닿고, 저장할 때마다 그 크기를
   * 통째로 다시 올리게 됩니다.
   */
  const handleImageUpload = useCallback(async () => {
    if (!editor) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      setImageError(null);
      setUploadingImage(true);

      try {
        const formData = new FormData();
        formData.append("image", file);
        formData.append("chapterId", chapterId);

        const res = await fetch(`/api/books/${bookId}/images`, {
          method: "POST",
          body: formData,
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error ?? "이미지를 올리지 못했어요.");
        }

        editor.chain().focus().setImage({ src: json.data.url }).run();
      } catch (err) {
        // 조용히 실패하면 크리에이터는 이미지가 사라진 이유를 알 수 없습니다.
        setImageError(
          err instanceof Error ? err.message : "이미지를 올리지 못했어요.",
        );
      } finally {
        setUploadingImage(false);
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

      {/* Status bar */}
      <div className="flex items-center justify-between gap-3 border-t border-line px-8 py-2">
        <span className="truncate text-xs">
          {uploadingImage && <span className="text-muted">이미지 올리는 중</span>}
          {imageError && <span className="text-danger">{imageError}</span>}
        </span>
        <span className="shrink-0 text-xs text-muted">
          {wordCount.toLocaleString()} 단어
        </span>
      </div>
    </div>
  );
}
