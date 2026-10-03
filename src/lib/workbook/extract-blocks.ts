import { htmlToDOM } from "html-react-parser";
import type { DOMNode, Element } from "html-react-parser";
import { calloutTypeOf, scaleRange } from "./block-config";
import { isElementNode } from "./dom";
import {
  REFLECTION_FIELD_KEY,
  SCALE_FIELD_KEY,
  SMART_GOAL_FIELDS,
  type ChecklistItem,
  type WorkbookBlock,
  type WorkbookBlockField,
  type WorkbookBlockType,
} from "./types";

/**
 * 챕터 HTML에 박힌 `data-template-type` 값 → `workbook_blocks.block_type`.
 *
 * 왼쪽은 에디터 Node·리더 컴포넌트·EPUB/PDF 폴백이 공유하는 문자열이고,
 * 오른쪽은 DB의 값입니다. 블록을 추가할 때 이 표에 함께 넣으세요.
 */
const BLOCK_TYPE_BY_TEMPLATE: Readonly<Record<string, WorkbookBlockType>> = {
  checklist: "checklist",
  callout: "callout",
  reflection: "reflection",
  "smart-goal": "smart_goal",
  scale: "scale",
};

/**
 * 챕터 HTML에서 워크북 블록 정의를 뽑아냅니다.
 *
 * 크리에이터가 챕터를 저장할 때 이 결과를 `workbook_blocks` /
 * `workbook_block_fields`에 반영합니다. 독자 응답은 여기서 나오지
 * 않습니다 — 정의와 응답은 (block_id, field_key)로만 만납니다.
 *
 * `data-node-id`가 없는 블록은 건너뜁니다. 응답을 매달 키가 없어서
 * 저장해도 아무것도 가리키지 못하기 때문입니다. 여기서 ID를 새로
 * 만들면 저장할 때마다 키가 달라져 응답이 끊깁니다.
 */
export function extractWorkbookBlocks(html: string): WorkbookBlock[] {
  const blocks: WorkbookBlock[] = [];

  for (const element of walkElements(htmlToDOM(html) as DOMNode[])) {
    const templateType = element.attribs?.["data-template-type"];
    if (!templateType) continue;

    const blockType = BLOCK_TYPE_BY_TEMPLATE[templateType];
    if (!blockType) continue;

    const id = element.attribs["data-node-id"];
    if (!id) continue;

    blocks.push({
      id,
      block_type: blockType,
      order_index: blocks.length,
      config: readConfig(blockType, element),
      fields: readFields(blockType, element),
    });
  }

  return blocks;
}

/**
 * 챕터 HTML에 들어 있는 워크북 블록 엘리먼트의 수.
 *
 * {@link extractWorkbookBlocks}와 달리 `data-node-id`가 없는 블록도
 * 셉니다. 그 차이가 곧 "화면에는 보이지만 응답을 받을 수 없는 블록"의
 * 수이고, 공개 전 검수가 그것을 차단 사유로 씁니다. 세는 것과 뽑는 것을
 * 나눈 이유는, 추출 쪽에서 ID를 만들어 채우면 저장할 때마다 키가 바뀌어
 * 응답이 끊기기 때문입니다.
 */
export function countWorkbookBlockElements(html: string): number {
  let count = 0;

  for (const element of walkElements(htmlToDOM(html) as DOMNode[])) {
    const templateType = element.attribs?.["data-template-type"];
    if (templateType && BLOCK_TYPE_BY_TEMPLATE[templateType]) count += 1;
  }

  return count;
}

function* walkElements(nodes: readonly DOMNode[]): Generator<Element> {
  for (const node of nodes) {
    if (!isElementNode(node)) continue;
    yield node;
    yield* walkElements(node.children as DOMNode[]);
  }
}

function readConfig(
  blockType: WorkbookBlockType,
  element: Element,
): WorkbookBlock["config"] {
  const attr = (name: string) => element.attribs[name] ?? "";

  switch (blockType) {
    case "callout":
      return {
        callout_type: calloutTypeOf(attr("data-callout-type")),
        content: attr("data-content"),
      };

    case "reflection":
      return { placeholder: attr("data-placeholder") };

    case "scale": {
      // 저장 라우트가 이 범위로 독자 답을 검사합니다. 리더가 그리는 칸과
      // 같아야 하므로 같은 함수로 해석합니다.
      const { min, max } = scaleRange(attr("data-min"), attr("data-max"));
      return {
        min,
        max,
        label_min: attr("data-label-min"),
        label_max: attr("data-label-max"),
      };
    }

    case "checklist":
    case "smart_goal":
      return {};
  }
}

function readFields(
  blockType: WorkbookBlockType,
  element: Element,
): WorkbookBlockField[] {
  switch (blockType) {
    // 콜아웃은 독자가 쓸 칸이 없습니다.
    case "callout":
      return [];

    case "checklist":
      return readChecklistItems(element.attribs["data-items"]).map(
        (item, index) => ({
          field_key: item.id,
          label: item.text,
          input_type: "boolean" as const,
          order_index: index,
        }),
      );

    case "reflection":
      return [
        {
          field_key: REFLECTION_FIELD_KEY,
          label: element.attribs["data-prompt"] ?? "",
          input_type: "longtext",
          order_index: 0,
        },
      ];

    case "smart_goal":
      return SMART_GOAL_FIELDS.map((field, index) => ({
        field_key: field.key,
        label: field.label,
        input_type: "longtext" as const,
        order_index: index,
      }));

    case "scale":
      return [
        {
          field_key: SCALE_FIELD_KEY,
          label: [
            element.attribs["data-label-min"],
            element.attribs["data-label-max"],
          ]
            .filter(Boolean)
            .join(" — "),
          input_type: "integer",
          order_index: 0,
        },
      ];
  }
}

/**
 * 체크리스트 항목을 읽습니다 — 화면(리더·PDF/EPUB 폴백)에 그릴 목록.
 *
 * 같은 `id`가 또 나오면 앞의 것만 남깁니다. 둘 다 그리면 두 항목이 답
 * 하나를 나눠 가져 하나를 누르면 둘 다 켜지고 "2개 중 2개"가 됩니다
 * (코드 리뷰 3-P1-13). 에디터는 불러올 때 겹친 키를 고치고(WP4), 공개 전
 * 검수는 {@link readChecklistItems}로 겹친 것을 찾아 막습니다.
 */
export function parseChecklistItems(raw: string | undefined): ChecklistItem[] {
  const seen = new Set<string>();
  return readChecklistItems(raw).filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * `data-items`를 읽은 목록이 원문을 빠짐없이 담는가.
 *
 * 읽는 쪽(`readChecklistItems`)은 깨진 JSON·객체가 아닌 항목·`id` 없는
 * 항목을 버립니다. 그 목록으로 편집해 다시 쓰면 버린 것이 HTML에서 영구히
 * 지워지므로(4-P1-3), 에디터는 이것이 false면 편집을 막고 안내합니다.
 * 에디터가 불러올 때 고칠 수 있는 것(겹치거나 빈 키, 문자열 항목)은
 * `TemplateNodeIds`가 먼저 고칩니다.
 */
export function isChecklistItemsIntact(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") return true;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!Array.isArray(parsed)) return false;

  return parsed.every((item: unknown) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return false;
    }
    const { id, text } = item as { id?: unknown; text?: unknown };
    return (
      typeof id === "string" &&
      id.length > 0 &&
      (text === undefined || typeof text === "string")
    );
  });
}

/**
 * 체크리스트 항목을 HTML에 적힌 그대로 읽습니다. 겹친 `id`도 남깁니다 —
 * 블록 추출이 이것을 써서, 동기화(`storableBlocks`)와 검수
 * (`blocksWithUnstorableFields`)가 겹친 키를 보고 다룹니다.
 *
 * `id`가 없는 항목은 버립니다. 항목의 `id`가 곧 `field_key`이고,
 * 여기서 임의로 만들어 붙이면 저장할 때마다 키가 바뀌어 그 항목의
 * 체크 상태가 매번 사라집니다.
 *
 * `text`가 문자열이 아니면 빈 문구로 둡니다. 객체가 그대로 흘러가면
 * 리더가 렌더 중에 던집니다.
 */
export function readChecklistItems(raw: string | undefined): ChecklistItem[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const items: ChecklistItem[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const candidate = item as { id?: unknown; text?: unknown };
    if (typeof candidate.id !== "string" || candidate.id.length === 0) continue;
    items.push({
      id: candidate.id,
      text: typeof candidate.text === "string" ? candidate.text : "",
    });
  }
  return items;
}
