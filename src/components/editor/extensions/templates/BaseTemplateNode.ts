import { Node, mergeAttributes } from "@tiptap/core";

export interface BaseTemplateNodeOptions {
  templateType: string;
}

/**
 * Creates a TipTap Node for an interactive template block.
 * All template nodes share: data-template-type, data-node-id, and a <section> wrapper.
 *
 * nodeId는 블록이 문서에 들어오는 순간 1회 부여되고 그 뒤로 바뀌지
 * 않습니다. 독자 응답이 이 ID에 매달려 있어서, 파싱 중에 새로 만들면
 * 속성이 한 번 유실될 때마다 응답이 통째로 끊깁니다. 부여와 붙여넣기
 * 규칙은 `TemplateNodeIds` 확장 하나가 템플릿 노드 전부를 맡습니다 —
 * 이 노드를 쓰는 에디터에는 그 확장도 함께 넣으세요.
 */
export function createTemplateNode(
  name: string,
  templateType: string,
  extraAttrs: Record<string, { default: string | number | boolean | null; parseHTML?: (el: HTMLElement) => string | number | boolean | null; renderHTML?: (attrs: Record<string, unknown>) => Record<string, string> | null }> = {}
) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    draggable: true,

    addAttributes() {
      return {
        nodeId: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute("data-node-id"),
          renderHTML: (attrs) =>
            attrs.nodeId ? { "data-node-id": attrs.nodeId as string } : {},
        },
        ...extraAttrs,
      };
    },

    parseHTML() {
      return [{ tag: `section[data-template-type="${templateType}"]` }];
    },

    // atom 노드라 content hole(`0`)을 두면 안 됩니다. 넣으면
    // DOMSerializer가 던져서 `getHTML()`이 실패하고, 블록이 든 챕터가
    // 저장되지 않습니다. 블록 내용은 전부 data-* 속성에 있습니다.
    renderHTML({ HTMLAttributes }) {
      return [
        "section",
        mergeAttributes(HTMLAttributes, { "data-template-type": templateType }),
      ];
    },
  });
}

