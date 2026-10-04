import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { sanitizeContent } from "@/lib/sanitize";

/**
 * 에디터가 낸 서식이 저장(sanitize) → 다시 불러오기를 거쳐도 남는가.
 *
 * 서식 확장은 `RichTextEditor.tsx`의 설정을 그대로 옮겼습니다. 거기에 서식을
 * 더하면 여기에도 더하세요 — sanitize 허용 목록에 없는 서식은 저장할 때마다
 * 조용히 사라집니다(코드 리뷰 5-P1-4·5-P1-5·5-P1-10).
 */

const editors: Editor[] = [];

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

function createEditor(content: string): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        underline: false,
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content,
  });
  editors.push(editor);
  return editor;
}

describe("에디터 서식 왕복", () => {
  it.each([
    ["밑줄", "<p><u>밑줄</u></p>"],
    ["취소선", "<p><s>취소선</s></p>"],
    ["형광펜", "<p><mark>형광펜</mark></p>"],
    ["문단 가운데 정렬", '<p style="text-align: center">가운데</p>'],
    ["제목 오른쪽 정렬", '<h2 style="text-align: right">제목</h2>'],
    [
      "새 탭 링크",
      '<p><a target="_blank" rel="noopener noreferrer" href="https://example.com">링크</a></p>',
    ],
  ])("%s — 저장 뒤 다시 불러와도 남는다", (_name, html) => {
    const saved = sanitizeContent(createEditor(html).getHTML());
    const reloaded = createEditor(saved).getHTML();
    expect(reloaded).toBe(createEditor(html).getHTML());
  });
});
