"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { SlashCommand } from "./extensions/SlashCommand";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Superscript from "@tiptap/extension-superscript";
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
  TemplateNodeIds,
} from "./extensions/templates";
import { cn } from "@/lib/utils";
import {
  EDITOR_IMAGE_TYPES,
  imageFilesFrom,
  uploadChapterImage,
} from "./chapter-image-upload";

const EMPTY_LINE_PLACEHOLDER = "/를 입력하면 워크북 블록을 넣을 수 있어요";

interface RichTextEditorProps {
  content: string;
  onUpdate: (html: string) => void;
  bookId: string;
  chapterId: string;
  placeholder?: string;
  className?: string;
  toolbarClassName?: string;
}

export function RichTextEditor({
  content,
  onUpdate,
  bookId,
  chapterId,
  placeholder = "내용을 입력하세요",
  className,
  toolbarClassName,
}: RichTextEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the chapterId to detect chapter switches
  const prevChapterRef = useRef<string>(chapterId);
  const imageUploadRef = useRef<(() => void) | null>(null);
  // 붙여넣기·끌어 넣기는 에디터를 만들 때 정한 editorProps에서 받으므로, 최신
  // bookId·chapterId를 쓰는 함수를 ref로 건넵니다.
  const insertImageFilesRef = useRef<((files: File[], at?: number) => void) | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { exitOnTripleEnter: false },
        // StarterKit 3에도 Link·Underline이 들어 있습니다. 끄지 않으면 아래 설정과
        // 함께 두 번 등록되고, StarterKit 쪽 Link(openOnClick: true) 때문에 편집 중
        // 링크를 누르면 새 탭이 열립니다.
        link: false,
        underline: false,
      }),
      BlockExitOnEnter,
      SlashCommand.configure({ imageUploadRef }),
      Underline,
      Superscript,
      Highlight.configure({ multicolor: false }),
      // base64 이미지는 받지 않습니다 — 붙여넣기·끌어 넣기는 아래 handlePaste·
      // handleDrop이 Storage에 올린 뒤 URL로 넣습니다(12-P1-9).
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      // 커서가 있는 빈 줄에만 뜹니다. 원고를 올린 장처럼 본문이 이미 차 있어도
      // 새 줄을 만들 때마다 `/`로 블록을 넣을 수 있다는 것이 보이게 합니다.
      Placeholder.configure({
        placeholder: ({ editor: ed, node }) => {
          if (ed.isEmpty) return placeholder;
          return node.type.name === "paragraph" ? EMPTY_LINE_PLACEHOLDER : "";
        },
      }),
      ChecklistNode,
      CalloutNode,
      ReflectionNode,
      SmartGoalNode,
      ScaleNode,
      // 잘라낸 블록이 ID를 지킬 수 있는 범위는 책 하나입니다.
      TemplateNodeIds.configure({ scope: bookId }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "prose prose-gray max-w-none focus:outline-none min-h-[60vh] text-primary leading-relaxed",
      },
      handlePaste: (_view, event) => {
        const files = imageFilesFrom(event.clipboardData);
        if (files.length === 0) return false;
        event.preventDefault();
        insertImageFilesRef.current?.(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = imageFilesFrom(event.dataTransfer);
        if (files.length === 0) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertImageFilesRef.current?.(files, at);
        return true;
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
   * 본문 이미지는 Storage에 올리고 URL만 문서에 넣습니다. 올리기 전에는 넣지
   * 않습니다 — 실패한 이미지가 문서에 남으면 저장되지 않는 칸이 됩니다.
   *
   * base64로 인라인하면 이미지 한 장이 본문 HTML을 수십 KB씩 부풀려
   * `content_html`의 500,000자 제한에 금방 닿고, 저장할 때마다 그 크기를
   * 통째로 다시 올리게 됩니다.
   *
   * `at`이 있으면(끌어 넣기) 그 자리에, 없으면 커서 자리에 넣습니다.
   */
  const insertImageFiles = useCallback(
    async (files: File[], at?: number) => {
      if (!editor || files.length === 0) return;
      setImageError(null);
      setUploadingImage(true);
      try {
        let pos = at;
        for (const file of files) {
          const src = await uploadChapterImage(bookId, chapterId, file);
          if (pos === undefined) {
            editor.chain().focus().setImage({ src }).run();
          } else {
            editor.chain().focus().insertContentAt(pos, { type: "image", attrs: { src } }).run();
            pos = editor.state.selection.to;
          }
        }
      } catch (err) {
        // 조용히 실패하면 크리에이터는 이미지가 사라진 이유를 알 수 없습니다.
        setImageError(
          err instanceof Error ? err.message : "이미지를 올리지 못했어요.",
        );
      } finally {
        setUploadingImage(false);
      }
    },
    [editor, bookId, chapterId],
  );

  const handleImageUpload = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = EDITOR_IMAGE_TYPES.join(",");
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void insertImageFiles([file]);
    };
    input.click();
  }, [insertImageFiles]);

  useEffect(() => {
    imageUploadRef.current = handleImageUpload;
    insertImageFilesRef.current = (files, at) => void insertImageFiles(files, at);
  }, [handleImageUpload, insertImageFiles]);

  const wordCount = editor
    ? editor.getText().trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div className={cn("flex flex-col", className)}>
      {editor && (
        <>
          <EditorToolbar
            editor={editor}
            onImageUpload={handleImageUpload}
            className={toolbarClassName}
          />
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
