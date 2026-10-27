import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { BlockExitOnEnter } from "./extensions/BlockExitOnEnter";
import { SlashCommand } from "./extensions/SlashCommand";
import {
  CalloutNode,
  ChecklistNode,
  ReflectionNode,
  ScaleNode,
  SmartGoalNode,
  TemplateNodeIds,
} from "./extensions/templates";

/**
 * Enter 처리 순서 (코드 리뷰 12-P1-6·12-P1-7·12-P1-8).
 *
 * 확장 설정은 `RichTextEditor.tsx`와 같은 순서입니다. 슬래시 메뉴는 React로
 * 그려지므로 `EditorContent`까지 띄웁니다.
 */

let current: Editor | null = null;

// jsdom에는 레이아웃이 없습니다. ProseMirror가 커서를 화면에 맞추려고 부르는 것만 채웁니다.
beforeAll(() => {
  const empty = () => [] as unknown as DOMRectList;
  const zero = () => new DOMRect(0, 0, 0, 0);
  Range.prototype.getClientRects ??= empty;
  Range.prototype.getBoundingClientRect ??= zero;
  Element.prototype.getClientRects ??= empty;
});

function Harness({
  content,
  onReady,
}: {
  content: string;
  onReady: (editor: Editor) => void;
}) {
  const editor = useEditor({
    immediatelyRender: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { exitOnTripleEnter: false },
        link: false,
        underline: false,
      }),
      BlockExitOnEnter,
      SlashCommand,
      ChecklistNode,
      CalloutNode,
      ReflectionNode,
      SmartGoalNode,
      ScaleNode,
      TemplateNodeIds,
    ],
    content,
  });
  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);
  return <EditorContent editor={editor} />;
}

function mount(content: string): Editor {
  render(
    <Harness
      content={content}
      onReady={(editor) => {
        current = editor;
      }}
    />,
  );
  if (!current) throw new Error("editor not ready");
  return current;
}

function press(editor: Editor, key: string) {
  act(() => {
    editor.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        keyCode: key === "Enter" ? 13 : key === "ArrowDown" ? 40 : 38,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

function type(editor: Editor, text: string) {
  act(() => {
    editor.commands.insertContent(text);
  });
}

/**
 * 최상위 노드 이름. StarterKit 3의 TrailingNode가 문서 끝에 붙이는 빈 문단은
 * 뺍니다 — 운영 에디터에도 있는 동작이라 끄지 않았습니다.
 */
function topLevel(editor: Editor): string[] {
  const names: string[] = [];
  editor.state.doc.forEach((node) => names.push(node.type.name));
  const last = editor.state.doc.lastChild;
  if (names.length > 1 && last?.type.name === "paragraph" && last.content.size === 0) names.pop();
  return names;
}

afterEach(() => {
  current = null;
});

describe("슬래시 메뉴와 Enter", () => {
  it("제목 줄에서 /체크 + Enter로 블록이 들어간다 — 제목 처리가 Enter를 가져가지 않는다", async () => {
    const editor = mount("<h2></h2>");
    act(() => {
      editor.commands.focus("end");
    });
    type(editor, "/체크");
    await screen.findByText("체크리스트");

    press(editor, "Enter");

    expect(topLevel(editor)).toContain("checklist");
    expect(editor.getText()).not.toContain("/체크");
  });

  it("결과가 없으면 Enter·화살표를 삼키지 않는다 — /없는명령 다음 줄로 넘어간다", async () => {
    const editor = mount("<p></p>");
    act(() => {
      editor.commands.focus("end");
    });
    type(editor, "/없는명령");
    await screen.findByText("결과 없음");

    press(editor, "ArrowDown");
    press(editor, "Enter");

    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.selection.$head.index(0)).toBe(1);
    expect(editor.state.doc.firstChild?.textContent).toBe("/없는명령");
  });
});

describe("BlockExitOnEnter", () => {
  it("제목 맨 앞 Enter는 위에 빈 문단을 넣고 제목은 그대로 둔다", () => {
    const editor = mount("<h2>장 제목</h2>");
    act(() => {
      editor.commands.setTextSelection(1);
    });

    press(editor, "Enter");

    const doc = editor.state.doc;
    expect(topLevel(editor)).toEqual(["paragraph", "heading"]);
    expect(doc.child(0).textContent).toBe("");
    expect(doc.child(1).textContent).toBe("장 제목");
    expect(editor.state.selection.$head.parent.type.name).toBe("heading");
  });

  it("제목 가운데 Enter는 지금처럼 뒤쪽을 문단으로 나눈다", () => {
    const editor = mount("<h2>장제목</h2>");
    act(() => {
      editor.commands.setTextSelection(3);
    });

    press(editor, "Enter");

    expect(topLevel(editor)).toEqual(["heading", "paragraph"]);
    expect(editor.state.doc.child(0).textContent).toBe("장제");
    expect(editor.state.doc.child(1).textContent).toBe("목");
  });

  it("빈 코드 블록에서 Enter는 문단으로 빠져나온다", () => {
    const editor = mount("<pre><code></code></pre>");
    act(() => {
      editor.commands.setTextSelection(1);
    });

    press(editor, "Enter");

    expect(topLevel(editor)).toEqual(["paragraph"]);
  });
});
