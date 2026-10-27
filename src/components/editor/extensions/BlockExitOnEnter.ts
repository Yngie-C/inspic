import { Extension } from "@tiptap/core";
import { SlashCommandPluginKey } from "./SlashCommand";

export const BlockExitOnEnter = Extension.create({
  name: "blockExitOnEnter",
  // 코드 블록(기본 100)보다 먼저 받아야 빈 코드 블록에서 빠져나옵니다. 그래서
  // 슬래시 메뉴(Suggestion, 100)보다도 먼저 받으므로, 메뉴가 열려 있으면 아래에서
  // 양보합니다(결정 3 — 우선순위를 낮추면 코드 블록 탈출이 다시 깨집니다).
  priority: 150,

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor;

        // 슬래시 메뉴가 열려 있으면 Enter는 메뉴의 것입니다. 가져가면 제목 줄에서
        // `/체크` + Enter가 블록을 넣지 않고 제목을 가릅니다(12-P1-6).
        if (SlashCommandPluginKey.getState(state)?.active) return false;

        const { $head } = state.selection;

        // Case 1: Heading — always exit to paragraph on Enter
        if ($head.parent.type.name === "heading") {
          if ($head.parent.textContent === "") {
            // Empty heading → convert to paragraph
            return editor.commands.setNode("paragraph");
          }
          // 맨 앞이면 위에 빈 문단만 넣고 제목과 커서는 그대로 둡니다(12-P1-7).
          // `splitBlock`에 맡기면 글이 남은 아래 칸이 문단으로 바뀌어 장 제목이
          // 말없이 본문 글씨가 됩니다.
          if ($head.parentOffset === 0) {
            const paragraph = state.schema.nodes.paragraph;
            return editor.commands.command(({ tr }) => {
              tr.insert($head.before(), paragraph.create());
              return true;
            });
          }
          // Has text → split block, convert the new (second) block to paragraph
          // e.g., {H2}"텍스트A|텍스트B" → {H2}"텍스트A" + {P}"텍스트B"
          return editor.chain().splitBlock().setNode("paragraph").run();
        }

        // Case 2: Blockquote — wrapper node, $head.parent is inner paragraph
        // Must check $head.node(-1) for the blockquote wrapper
        if (
          $head.depth >= 2 &&
          $head.node(-1).type.name === "blockquote" &&
          $head.parent.textContent === ""
        ) {
          return editor.commands.lift("blockquote");
        }

        // Case 3: CodeBlock — direct textblock, exit only when ENTIRE block is empty
        if ($head.parent.type.name === "codeBlock" && $head.parent.textContent.length === 0) {
          return editor.commands.setNode("paragraph");
        }

        // All other cases: return false to let default behavior run
        return false;
      },
    };
  },
});
