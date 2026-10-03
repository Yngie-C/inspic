import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  CalloutNode,
  ChecklistNode,
  ReflectionNode,
  ScaleNode,
  SmartGoalNode,
  TemplateNodeIds,
} from "./index";

/**
 * 워크북 블록이 HTML로 나가는지.
 *
 * 에디터는 `getHTML()`로 본문을 만들어 저장합니다. 여기서 던지면 블록이
 * 든 챕터는 저장되지 않습니다(코드 리뷰 4-P0-1). 블록 내용은 전부
 * data-* 속성에 있으므로 속성이 그대로 나가는지도 함께 봅니다.
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

const TEMPLATE_TYPES = [
  "checklist",
  "callout",
  "reflection",
  "smart-goal",
  "scale",
] as const;

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("워크북 블록 직렬화", () => {
  it.each(TEMPLATE_TYPES)("%s 블록이 든 본문을 불러와 HTML로 낼 수 있다", (type) => {
    editor = new Editor({
      extensions,
      content: `<p>본문</p><section data-template-type="${type}" data-node-id="block-a"></section>`,
    });

    const html = editor.getHTML();

    expect(html).toContain(`data-template-type="${type}"`);
    expect(html).toContain('data-node-id="block-a"');
  });

  it("새로 넣은 블록도 HTML로 나가고 ID를 받는다", () => {
    editor = new Editor({ extensions, content: "<p>본문</p>" });

    editor.commands.insertContent({ type: "reflection" });
    const html = editor.getHTML();

    expect(html).toMatch(/<section data-node-id="[^"]+"[^>]*data-template-type="reflection"/);
  });

  it("블록 속성이 저장·재로드를 거쳐도 그대로 남는다", () => {
    const original =
      '<section data-template-type="scale" data-node-id="block-s" data-min="0" data-max="5" data-label-min="전혀" data-label-max="매우"></section>';
    editor = new Editor({ extensions, content: original });
    const saved = editor.getHTML();
    editor.destroy();

    editor = new Editor({ extensions, content: saved });

    expect(editor.getHTML()).toBe(saved);
    expect(saved).toContain('data-min="0"');
    expect(saved).toContain('data-label-max="매우"');
  });
});

describe("불러온 블록의 속성 (4-P1-1, 4-P1-2)", () => {
  function attrsOf(html: string) {
    editor = new Editor({ extensions, content: html });
    let attrs: Record<string, unknown> | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name !== "paragraph" && node.type.name !== "doc" && !attrs) {
        attrs = node.attrs;
      }
    });
    return attrs as unknown as Record<string, unknown>;
  }

  it("일부러 비운 문구를 기본 문구로 되살리지 않는다", () => {
    const attrs = attrsOf(
      `<section data-template-type="reflection" data-node-id="block-a" data-prompt="" data-placeholder=""></section>`,
    );

    expect(attrs.prompt).toBe("");
    expect(attrs.placeholder).toBe("");
  });

  it("속성이 아예 없을 때만 기본값을 쓴다", () => {
    const attrs = attrsOf(
      `<section data-template-type="reflection" data-node-id="block-a"></section>`,
    );

    expect(attrs.prompt).toBe("이 장의 내용을 이번 주에 어디에 써 볼 수 있을까요?");
  });

  it("척도·참고의 빈 값도 그대로 둔다", () => {
    expect(
      attrsOf(`<section data-template-type="scale" data-node-id="block-a" data-label-min=""></section>`)
        .labelMin,
    ).toBe("");
    editor?.destroy();
    expect(
      attrsOf(`<section data-template-type="callout" data-node-id="block-a" data-content=""></section>`)
        .content,
    ).toBe("");
  });

  it("data-items가 없는 체크리스트에 항목을 지어내지 않는다", () => {
    const attrs = attrsOf(
      `<section data-template-type="checklist" data-node-id="block-a"></section>`,
    );

    expect(JSON.parse(attrs.items as string)).toEqual([]);
  });

  it("새로 넣는 체크리스트는 첫 항목을 받는다", () => {
    editor = new Editor({ extensions, content: "<p>본문</p>" });
    editor.commands.insertContent({ type: "checklist" });

    expect(editor.getHTML()).toContain("항목 1");
  });
});

