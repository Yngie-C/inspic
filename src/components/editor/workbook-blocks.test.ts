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

  it("슬래시 명령의 /검색어 자리를 지우고 넣는다", () => {
    editor = new Editor({ extensions, content: "<p>/척도</p>" });

    insertWorkbookBlock(editor, "scale", { from: 1, to: 4 });

    expect(editor.getText()).not.toContain("/척도");
    expect(blockIds(editor)).toHaveLength(1);
  });
});
