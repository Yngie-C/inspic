import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  CalloutNode,
  ChecklistNode,
  ReflectionNode,
  ScaleNode,
  SmartGoalNode,
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
