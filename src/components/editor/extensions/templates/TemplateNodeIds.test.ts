import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import {
  CalloutNode,
  ChecklistNode,
  ReflectionNode,
  ScaleNode,
  SmartGoalNode,
} from "./index";
import {
  TemplateNodeIds,
  normalizeChecklistItems,
  resetCutTemplateIds,
} from "./TemplateNodeIds";

/**
 * 블록 ID 규칙 — 원래 있던 블록은 ID를 지키고, 새로 들어온 블록만 새 ID.
 *
 * 독자 응답이 이 ID에 매달려 있어서, 여기서 틀리면 답이 엉뚱한 블록에
 * 붙거나 통째로 끊깁니다. 코드 리뷰 4-P0-2·4-P0-3·4-P1-4·4-P1-5·4-P2-3.
 */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function extensions(scope = "book-1") {
  return [
    StarterKit,
    ChecklistNode,
    CalloutNode,
    ReflectionNode,
    SmartGoalNode,
    ScaleNode,
    TemplateNodeIds.configure({ scope }),
  ];
}

function block(id: string | null, prompt = "질문"): string {
  const idAttr = id ? ` data-node-id="${id}"` : "";
  return `<section data-template-type="reflection"${idAttr} data-prompt="${prompt}"></section>`;
}

const editors: Editor[] = [];

function makeEditor(content: string, scope?: string): Editor {
  const editor = new Editor({ extensions: extensions(scope), content });
  editors.push(editor);
  return editor;
}

/** onCreate는 setTimeout 뒤에 옵니다. */
function created(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 문서 순서대로 (ID, 질문). */
function blocks(editor: Editor): Array<{ id: string | null; prompt: string }> {
  const found: Array<{ id: string | null; prompt: string }> = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "reflection") return true;
    found.push({
      id: (node.attrs.nodeId as string | null) ?? null,
      prompt: node.attrs.prompt as string,
    });
    return false;
  });
  return found;
}

function blockPos(editor: Editor, id: string): number {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs.nodeId === id) at = pos;
    return at < 0;
  });
  if (at < 0) throw new Error(`block ${id} not found`);
  return at;
}

/** 블록을 골라 잘라냅니다 — 실제 DOM `cut` 이벤트를 거칩니다. */
function cutBlock(editor: Editor, id: string): void {
  const pos = blockPos(editor, id);
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)),
  );
  editor.view.dom.dispatchEvent(new Event("cut", { bubbles: true }));
  // jsdom에서는 ProseMirror의 기본 잘라내기가 문서를 바꾸지 못할 수 있어
  // 지워졌는지 확인하고 남았으면 직접 지웁니다.
  if (blocks(editor).some((b) => b.id === id)) {
    editor.view.dispatch(editor.state.tr.deleteSelection());
  }
}

function pasteAt(editor: Editor, pos: number, html: string): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)),
  );
  // jsdom에는 ClipboardEvent가 없어 이벤트를 직접 넘깁니다.
  editor.view.pasteHTML(html, new Event("paste") as ClipboardEvent);
}

beforeEach(() => {
  resetCutTemplateIds();
});

afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy();
  vi.restoreAllMocks();
});

describe("붙여넣기", () => {
  it("원본보다 위에 붙여넣은 복사본이 새 ID를 받고, 원본은 ID를 지킨다", () => {
    const editor = makeEditor(`<p>앞</p>${block(A, "원본")}`);

    // 문서 맨 앞에 같은 블록(같은 ID)을 붙여넣습니다.
    pasteAt(editor, 1, block(A, "복사본"));

    const result = blocks(editor);
    expect(result).toHaveLength(2);
    const original = result.find((b) => b.prompt === "원본");
    const copy = result.find((b) => b.prompt === "복사본");
    expect(original?.id).toBe(A);
    expect(copy?.id).not.toBe(A);
    expect(copy?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("다른 장·책에서 복사해 온 블록은 이 문서에서 고유해도 새 ID를 받는다", () => {
    const editor = makeEditor("<p>본문</p>");

    pasteAt(editor, 1, block(B, "다른 장의 블록"));

    const [pasted] = blocks(editor);
    expect(pasted.prompt).toBe("다른 장의 블록");
    expect(pasted.id).not.toBe(B);
  });

  it("한 번에 여러 블록을 붙여도 서로 다른 새 ID를 받는다", () => {
    const editor = makeEditor("<p>본문</p>");

    pasteAt(editor, 1, block(A) + block(A) + block(null));

    const ids = blocks(editor).map((b) => b.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain(A);
    expect(ids).not.toContain(null);
  });
});

describe("잘라내기 → 붙여넣기", () => {
  it("같은 문서 안에서 옮기면 ID를 지킨다", () => {
    const editor = makeEditor(`<p>앞</p>${block(A, "옮길 블록")}<p>뒤</p>`);

    cutBlock(editor, A);
    expect(blocks(editor)).toHaveLength(0);
    pasteAt(editor, 1, block(A, "옮길 블록"));

    expect(blocks(editor)).toEqual([{ id: A, prompt: "옮길 블록" }]);
  });

  it("같은 책의 다른 장 에디터로 옮겨도 ID를 지킨다", () => {
    const chapter1 = makeEditor(`<p>1장</p>${block(A)}`, "book-1");
    cutBlock(chapter1, A);

    const chapter2 = makeEditor("<p>2장</p>", "book-1");
    pasteAt(chapter2, 1, block(A));

    expect(blocks(chapter2).map((b) => b.id)).toEqual([A]);
  });

  it("다른 책으로 옮기면 새 ID를 받는다 — 독자 답이 다른 책 블록에 붙지 않게", () => {
    const bookX = makeEditor(`<p>X</p>${block(A)}`, "book-x");
    cutBlock(bookX, A);

    const bookY = makeEditor("<p>Y</p>", "book-y");
    pasteAt(bookY, 1, block(A));

    expect(blocks(bookY).map((b) => b.id)).not.toContain(A);
  });

  it("잘라낸 것을 두 번 붙이면 두 번째는 복사본이다", () => {
    const editor = makeEditor(`<p>앞</p>${block(A)}<p>뒤</p>`);
    cutBlock(editor, A);

    pasteAt(editor, 1, block(A, "첫째"));
    pasteAt(editor, 1, block(A, "둘째"));

    const result = blocks(editor);
    expect(result.find((b) => b.prompt === "첫째")?.id).toBe(A);
    expect(result.find((b) => b.prompt === "둘째")?.id).not.toBe(A);
  });

  it("잘라내기를 되돌린 뒤 다른 장에 붙이면 복사본이다", () => {
    const chapter1 = makeEditor(`<p>1장</p>${block(A)}`);
    cutBlock(chapter1, A);
    // 실행 취소로 블록이 원래 자리에 돌아온 상태.
    chapter1.commands.insertContentAt(1, block(A));
    expect(blocks(chapter1).map((b) => b.id)).toEqual([A]);

    const chapter2 = makeEditor("<p>2장</p>");
    pasteAt(chapter2, 1, block(A));

    expect(blocks(chapter2).map((b) => b.id)).not.toContain(A);
  });
});

describe("끌어서 옮기기·복사", () => {
  it("같은 ID가 새로 들어오면 원래 있던 쪽이 지킨다 — 앞에 들어와도", () => {
    const editor = makeEditor(`<p>앞</p>${block(A, "원본")}`);

    // 끌어서 복사(Alt)처럼 붙여넣기 경로를 거치지 않고 앞에 들어온 경우.
    editor.commands.insertContentAt(0, block(A, "복사본"));

    const result = blocks(editor);
    expect(result[0]).toMatchObject({ prompt: "복사본" });
    expect(result[0].id).not.toBe(A);
    expect(result[1]).toEqual({ id: A, prompt: "원본" });
  });
});

describe("불러오기", () => {
  it("ID 없는 블록에 ID를 주고 저장되게 update를 낸다", async () => {
    const editor = makeEditor(`<p>본문</p>${block(null)}`);
    const onUpdate = vi.fn();
    editor.on("update", onUpdate);

    await created();

    expect(blocks(editor)[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("문서 안에서 겹치는 ID는 앞의 블록이 지키고, update를 낸다", async () => {
    const editor = makeEditor(block(A, "앞") + block(A, "뒤"));
    const onUpdate = vi.fn();
    editor.on("update", onUpdate);

    await created();

    const [first, second] = blocks(editor);
    expect(first).toEqual({ id: A, prompt: "앞" });
    expect(second.id).not.toBe(A);
    expect(onUpdate).toHaveBeenCalled();
  });

  it("setContent(emitUpdate: false)로 불러와도 고친 ID가 저장되게 update를 낸다", async () => {
    const editor = makeEditor("<p></p>");
    await created();
    const onUpdate = vi.fn();
    editor.on("update", onUpdate);

    editor.commands.setContent(block(null), { emitUpdate: false });

    expect(blocks(editor)[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("UUID가 아닌 ID는 새로 받는다 — 그런 ID에는 독자 답이 매달릴 수 없다", async () => {
    const editor = makeEditor(block("legacy-nanoid") + block(A));

    await created();

    const ids = blocks(editor).map((b) => b.id);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).toBe(A);
  });

  it("대문자 UUID는 소문자로 맞춘다 — DB가 돌려주는 값과 대조되게", async () => {
    const editor = makeEditor(block(A.toUpperCase()));

    await created();

    expect(blocks(editor)[0].id).toBe(A);
  });

  it("불러올 때 고친 것은 실행 취소로 되돌아가지 않는다", async () => {
    const editor = makeEditor(block(A, "앞") + block(A, "뒤") + block(null, "셋"));
    await created();
    const fixed = blocks(editor).map((b) => b.id);

    editor.commands.insertContentAt(0, "<p>글</p>");
    editor.commands.undo();
    editor.commands.undo();

    expect(blocks(editor).map((b) => b.id)).toEqual(fixed);
    expect(new Set(fixed).size).toBe(3);
  });

  it("고칠 것이 없으면 아무것도 바꾸지 않는다", async () => {
    const editor = makeEditor(block(A) + block(B));
    const onUpdate = vi.fn();
    editor.on("update", onUpdate);

    await created();
    editor.commands.setContent(block(A) + block(B), { emitUpdate: false });

    expect(blocks(editor).map((b) => b.id)).toEqual([A, B]);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("편집", () => {
  it("글자를 입력해도 블록 ID는 그대로다", () => {
    const editor = makeEditor(`<p>본문</p>${block(A)}${block(B)}`);

    editor.commands.insertContentAt(1, "추가한 글");

    expect(blocks(editor).map((b) => b.id)).toEqual([A, B]);
  });

  it("블록 속성을 고쳐도 ID는 그대로다", () => {
    const editor = makeEditor(block(A, "처음"));

    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(blockPos(editor, A), undefined, {
        nodeId: A,
        prompt: "고친 질문",
        placeholder: "",
      });
      return true;
    });

    expect(blocks(editor)).toEqual([{ id: A, prompt: "고친 질문" }]);
  });
});

describe("체크리스트 항목 키", () => {
  function checklistItems(editor: Editor): Array<{ id: string; text: string }> {
    let items: Array<{ id: string; text: string }> = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "checklist") {
        items = JSON.parse(node.attrs.items as string);
      }
      return true;
    });
    return items;
  }

  function checklist(items: unknown[]): string {
    const json = JSON.stringify(items).replace(/"/g, "&quot;");
    return `<section data-template-type="checklist" data-node-id="${A}" data-items="${json}"></section>`;
  }

  it("겹치거나 비었거나 64자를 넘는 키만 새로 받고, 문구와 앞의 키는 남는다", async () => {
    const editor = makeEditor(
      checklist([
        { id: "k1", text: "하나" },
        { id: "k1", text: "둘(겹침)" },
        { text: "셋(키 없음)" },
        { id: "x".repeat(65), text: "넷(너무 김)" },
        { id: "k5", text: "다섯" },
      ]),
    );
    await created();

    const items = checklistItems(editor);
    expect(items.map((item) => item.text)).toEqual([
      "하나",
      "둘(겹침)",
      "셋(키 없음)",
      "넷(너무 김)",
      "다섯",
    ]);
    expect(items[0].id).toBe("k1");
    expect(items[4].id).toBe("k5");
    expect(new Set(items.map((item) => item.id)).size).toBe(5);
    for (const item of items) {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.id.length).toBeLessThanOrEqual(64);
    }
  });

  it("문제가 없으면 null — 속성을 건드리지 않는다", () => {
    expect(
      normalizeChecklistItems(JSON.stringify([{ id: "a", text: "1" }, { id: "b", text: "2" }])),
    ).toBeNull();
    expect(normalizeChecklistItems("깨진 JSON")).toBeNull();
    expect(normalizeChecklistItems(JSON.stringify({ id: "a" }))).toBeNull();
  });

  it("문자열·숫자만 적힌 항목은 그 글을 문구로 한 항목이 된다 (4-P1-3)", () => {
    // 읽는 쪽이 객체가 아닌 항목을 버리므로, 그대로 두면 "항목 추가"를
    // 누르는 순간 HTML에서 지워집니다.
    const next = JSON.parse(
      normalizeChecklistItems(JSON.stringify(["운동하기", 7, { id: "a", text: 3 }]))!,
    );

    expect(next.map((item: { text: string }) => item.text)).toEqual(["운동하기", "7", "3"]);
    expect(next[2].id).toBe("a");
    expect(new Set(next.map((item: { id: string }) => item.id)).size).toBe(3);
  });
});

