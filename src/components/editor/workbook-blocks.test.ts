import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import {
  CalloutNode,
  ChecklistNode,
  ReflectionNode,
  ScaleNode,
  SmartGoalNode,
  TemplateNodeIds,
  TEMPLATE_NODE_NAMES,
} from "./extensions/templates";
import { WORKBOOK_BLOCKS, insertWorkbookBlock } from "./workbook-blocks";

/**
 * 툴바·슬래시 메뉴가 쓰는 블록 삽입.
 *
 * 툴바는 커서가 어디 있든 누를 수 있어서, 블록을 선택한 채 누르는 것이
 * 정상 경로입니다. 그때 선택된 블록을 덮으면 그 ID에 매달린 독자 답이
 * 끊깁니다.
 */

const extensions = [
  StarterKit,
  ChecklistNode,
  CalloutNode,
  ReflectionNode,
  SmartGoalNode,
  ScaleNode,
  TemplateNodeIds,
];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const EXISTING_ID = "11111111-1111-4111-8111-111111111111";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function blockIds(ed: Editor): string[] {
  const ids: string[] = [];
  ed.state.doc.descendants((node) => {
    if (TEMPLATE_NODE_NAMES.has(node.type.name)) ids.push(String(node.attrs.nodeId));
  });
  return ids;
}

describe("워크북 블록 목록", () => {
  it("에디터에 등록된 템플릿 노드와 정확히 같다", () => {
    expect(new Set(WORKBOOK_BLOCKS.map((b) => b.type))).toEqual(new Set(TEMPLATE_NODE_NAMES));
    expect(WORKBOOK_BLOCKS).toHaveLength(TEMPLATE_NODE_NAMES.size);
  });
});

describe("insertWorkbookBlock", () => {
  it.each(WORKBOOK_BLOCKS.map((b) => b.type))("%s 블록을 넣으면 UUID를 받는다", (type) => {
    editor = new Editor({ extensions, content: "<p>본문</p>" });

    insertWorkbookBlock(editor, type);

    const ids = blockIds(editor);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(UUID);
    expect(editor.getHTML()).toContain("data-template-type=");
  });

  it("블록을 선택한 채 넣으면 기존 블록을 지키고 그 뒤에 붙인다", () => {
    editor = new Editor({
      extensions,
      content: `<p>앞</p><section data-template-type="reflection" data-node-id="${EXISTING_ID}"></section><p>뒤</p>`,
    });
    let blockPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "reflection") blockPos = pos;
    });
    editor.commands.command(({ tr }) => {
      tr.setSelection(NodeSelection.create(tr.doc, blockPos));
      return true;
    });

    insertWorkbookBlock(editor, "scale");

    const names: string[] = [];
    editor.state.doc.forEach((node) => names.push(node.type.name));
    expect(names.indexOf("reflection")).toBeLessThan(names.indexOf("scale"));
    expect(blockIds(editor)[0]).toBe(EXISTING_ID);
    expect(blockIds(editor)).toHaveLength(2);
  });

  /**
   * 코드 리뷰 12-P0-1. 블록 하나를 고른 경우만이 아니라 전체 선택(Cmd+A)·여러
   * 블록에 걸친 드래그 선택에서도 선택한 내용을 지우지 않아야 합니다. 지우면 자동
   * 저장 뒤 그 블록 ID들이 장에서 빠지고 독자 답이 전부 고아가 됩니다.
   */
  const SECOND_ID = "22222222-2222-4222-8222-222222222222";
  const twoBlocks =
    `<p>앞 문단</p><section data-template-type="reflection" data-node-id="${EXISTING_ID}"></section>` +
    `<p>가운데</p><section data-template-type="checklist" data-node-id="${SECOND_ID}"></section><p>뒤 문단</p>`;

  it("전체 선택에서 넣어도 기존 블록·글을 지우지 않고 맨 뒤에 붙인다", () => {
    editor = new Editor({ extensions, content: twoBlocks });
    editor.commands.selectAll();

    insertWorkbookBlock(editor, "scale");

    expect(blockIds(editor).slice(0, 2)).toEqual([EXISTING_ID, SECOND_ID]);
    expect(blockIds(editor)).toHaveLength(3);
    expect(editor.getText()).toContain("앞 문단");
    expect(editor.getText()).toContain("뒤 문단");
    const names: string[] = [];
    editor.state.doc.forEach((node) => names.push(node.type.name));
    expect(names.slice(0, 6)).toEqual([
      "paragraph", "reflection", "paragraph", "checklist", "paragraph", "scale",
    ]);
  });

  it("블록에 걸친 글 선택에서 넣어도 걸친 블록을 지키고 선택이 끝나는 문단 뒤에 붙인다", () => {
    editor = new Editor({ extensions, content: twoBlocks });
    // "앞 문단"의 가운데부터 "가운데" 문단의 가운데까지 — 첫 블록을 품습니다.
    let from = -1;
    let to = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "앞 문단") from = pos + 1;
      if (node.isText && node.text === "가운데") to = pos + 2;
    });
    editor.commands.setTextSelection({ from, to });

    insertWorkbookBlock(editor, "scale");

    expect(blockIds(editor)).toContain(EXISTING_ID);
    expect(blockIds(editor)).toContain(SECOND_ID);
    const names: string[] = [];
    editor.state.doc.forEach((node) => names.push(node.type.name));
    expect(names).toEqual(["paragraph", "reflection", "paragraph", "scale", "checklist", "paragraph"]);
    expect(editor.getText()).toContain("앞 문단");
    expect(editor.getText()).toContain("가운데");
  });

  it("슬래시 명령의 /검색어 자리를 지우고 넣는다", () => {
    editor = new Editor({ extensions, content: "<p>/척도</p>" });

    insertWorkbookBlock(editor, "scale", { from: 1, to: 4 });

    expect(editor.getText()).not.toContain("/척도");
    expect(blockIds(editor)).toHaveLength(1);
  });
});
