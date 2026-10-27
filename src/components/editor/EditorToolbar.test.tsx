import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Superscript from "@tiptap/extension-superscript";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { EditorToolbar } from "./EditorToolbar";

/**
 * 툴바 버튼의 켜짐 상태 (코드 리뷰 12-P2-2). Tiptap 3은 트랜잭션마다 다시 그리지
 * 않아서, 커서를 굵은 글씨로 옮겨도 버튼이 켜지지 않았습니다.
 */

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function boldButton(): HTMLElement {
  return screen.getByTitle("굵게 (Ctrl+B)");
}

describe("EditorToolbar", () => {
  it("커서를 굵은 글씨로 옮기면 굵게 버튼이 켜지고, 나오면 꺼진다", () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ link: false, underline: false }),
        Underline,
        Superscript,
        Highlight,
        Link,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
      ],
      content: "<p>보통 <strong>굵게</strong></p>",
    });
    const ed = editor;
    act(() => {
      ed.commands.setTextSelection(2);
    });
    render(<EditorToolbar editor={ed} />);
    expect(boldButton().className).not.toContain("bg-primary");

    act(() => {
      ed.commands.setTextSelection(6);
    });
    expect(boldButton().className).toContain("bg-primary");

    act(() => {
      ed.commands.setTextSelection(2);
    });
    expect(boldButton().className).not.toContain("bg-primary");
  });
});
