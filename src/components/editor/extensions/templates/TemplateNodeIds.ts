import { Extension } from "@tiptap/core";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import {
  generateFieldKey,
  generateNodeId,
  isStorableBlockId,
  isStorableFieldKey,
} from "@/lib/template-node-id";

/**
 * 워크북 블록 ID 규칙 — 템플릿 노드 전부를 플러그인 하나가 다룹니다.
 *
 * 독자 응답은 `(block_id, field_key)`에 매달립니다. 그래서 규칙은 하나입니다.
 * **원래 문서에 있던 블록은 ID를 유지하고, 새로 들어온 블록만 새 ID를 받는다.**
 *
 * - 붙여넣기: 들어오는 블록에 새 ID. 복사본이 원본 ID를 들고 오면 두 블록이
 *   한 응답을 나눠 갖고, 다른 장·책에서 온 블록이면 저장할 때마다 블록이
 *   그쪽과 이쪽을 오갑니다(코드 리뷰 4-P0-2, 4-P0-3).
 * - 잘라내기 → 붙여넣기: 같은 책 안이면 ID를 유지합니다. 블록을 옮기는
 *   것이지 새로 만드는 것이 아니라서, 독자 답이 따라가야 합니다.
 * - 끌어서 옮기기: 유지. 끌어서 복사(Alt)는 원래 자리가 유지하고 새로
 *   놓인 쪽이 새 ID.
 * - ID가 없거나 UUID가 아닌 블록: 새 ID. 그런 ID에는 독자 답이 매달릴 수
 *   없으므로 바꿔도 끊기는 것이 없습니다.
 * - 문서 안에서 겹치는 블록: 원래 있던 쪽이 유지하고, 새로
 *   들어온 쪽이 새 ID. 둘 다 원래 있던 블록이면 문서 순서상 앞의 것.
 * - 불러오기(처음 열 때, `setContent`): 같은 규칙으로 고치고 저장되게
 *   `update`를 냅니다. 고친 ID가 저장되지 않으면 열 때마다 다른 ID가
 *   생겨서, 그사이 쓴 독자 답이 매번 끊깁니다(4-P1-5).
 *
 * 체크리스트 항목 키(field_key)도 여기서 고칩니다. 블록 안에서 겹치거나
 * 비었거나 DB 한도(64자)를 넘는 키는 독자 답을 담을 수 없으므로, 그때만
 * 새 키를 줍니다(4-P1-4, 3-P1-16).
 */

/** 템플릿 노드의 Tiptap 이름. `createTemplateNode()`의 첫 인자. */
export const TEMPLATE_NODE_NAMES: ReadonlySet<string> = new Set([
  "checklist",
  "callout",
  "reflection",
  "smartGoal",
  "scale",
]);

export interface TemplateNodeIdsOptions {
  /**
   * 잘라낸 블록이 ID를 유지할 수 있는 범위. 책 ID를 넣으세요.
   *
   * 장을 바꾸면 에디터가 새로 만들어지므로, 잘라낸 ID는 에디터 밖(모듈)에
   * 둡니다. 다른 책에 붙여넣은 블록까지 ID를 유지하면 독자 답이 엉뚱한
   * 책의 블록에 매달리므로 책 단위로 나눕니다.
   */
  scope: string;
}

const pluginKey = new PluginKey("templateNodeIds");

/** scope → 이 탭에서 잘라낸 블록 ID. */
const cutIdsByScope = new Map<string, Set<string>>();

function cutIds(scope: string): Set<string> {
  let ids = cutIdsByScope.get(scope);
  if (!ids) {
    ids = new Set();
    cutIdsByScope.set(scope, ids);
  }
  return ids;
}

/** 테스트용. 잘라낸 ID 기록을 비웁니다. */
export function resetCutTemplateIds(): void {
  cutIdsByScope.clear();
}

function isTemplateNode(node: PMNode): boolean {
  return TEMPLATE_NODE_NAMES.has(node.type.name);
}

/**
 * 블록의 ID. UUID가 아니면 없는 것으로 봅니다 — `workbook_blocks.id`와
 * `workbook_responses.block_id`가 uuid라서 그런 ID에는 독자 답이 매달릴 수
 * 없고, 그래서 바꿔도 끊기는 답이 없습니다.
 */
function nodeIdOf(node: PMNode): string | null {
  const id = node.attrs.nodeId;
  return typeof id === "string" && isStorableBlockId(id) ? id.toLowerCase() : null;
}

export const TemplateNodeIds = Extension.create<TemplateNodeIdsOptions>({
  name: "templateNodeIds",

  addOptions() {
    return { scope: "" };
  },

  addProseMirrorPlugins() {
    const scope = this.options.scope;

    return [
      new Plugin({
        key: pluginKey,

        // 불러오기는 아래 onTransaction이 따로 다룹니다. 여기서 고치면
        // `emitUpdate: false`에 묶여 저장되지 않습니다.
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          if (transactions.some((tr) => tr.getMeta("preventUpdate"))) {
            return null;
          }

          // 문서는 매 트랜잭션 뒤에 규칙을 지킨 상태입니다. 그래서 새로
          // 들어온 범위에 블록이 없으면(글자 입력 대부분) 볼 것이 없습니다.
          // 긴 장에서 키 입력마다 문서 전체를 돌지 않기 위해서입니다.
          const inserted = insertedRanges(transactions);
          if (!rangesContainTemplate(newState.doc, inserted)) return null;

          const tr = normalizeTemplateIds(newState, (pos) =>
            inserted.some(([from, to]) => pos >= from && pos < to),
          );

          // 잘라냈던 블록이 실행 취소 등으로 문서에 돌아왔으면, 다른 곳에
          // 붙여넣을 때 원래 ID를 가져가면 안 됩니다.
          forgetIdsPresentIn((tr ?? newState).doc, scope);

          return tr;
        },

        props: {
          transformPasted: (slice, view) => {
            // 이 에디터 안에서 끄는 중이면 그대로 둡니다. 옮기기면 원래
            // 자리가 사라지고, 복사면 appendTransaction이 새로 놓인
            // 쪽에 새 ID를 줍니다.
            if (view.dragging) return slice;
            return assignPastedIds(slice, view.state.doc, scope);
          },

          handleDOMEvents: {
            cut: (view) => {
              const { from, to } = view.state.selection;
              const ids = cutIds(scope);
              // 선택에 통째로 들어 있는 블록만. 지금 템플릿 노드는 atom이라
              // 걸치는 경우가 없지만, 내용을 가진 노드가 생겨도 남는 블록을
              // 잘라낸 것으로 기록하지 않게 합니다.
              view.state.doc.nodesBetween(from, to, (node, pos) => {
                if (!isTemplateNode(node)) return;
                if (pos < from || pos + node.nodeSize > to) return;
                const id = nodeIdOf(node);
                if (id) ids.add(id);
              });
              return false;
            },
          },
        },
      }),
    ];
  },

  onCreate() {
    fixLoadedDocument(this.editor.view.state, this.editor.view.dispatch);
  },

  onTransaction({ transaction }) {
    if (!transaction.docChanged || !transaction.getMeta("preventUpdate")) {
      return;
    }
    fixLoadedDocument(this.editor.view.state, this.editor.view.dispatch);
  },
});

/**
 * 불러온 문서를 고칩니다. 고친 것이 있으면 `update`가 나가는 트랜잭션으로
 * 내보내 에디터가 저장하게 합니다.
 */
function fixLoadedDocument(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
): void {
  const tr = normalizeTemplateIds(state, () => false);
  // 실행 취소 기록에 넣지 않습니다. 넣으면 "되돌리기"가 고친 ID를 옛
  // 상태(겹침·없음)로 돌리고 그대로 저장되며, 다음에 열 때 다른 ID가
  // 생겨 그사이 쓴 독자 답이 끊깁니다.
  if (tr) dispatch(tr.setMeta("addToHistory", false));
}

/**
 * 문서 안 블록 ID와 체크리스트 항목 키를 규칙에 맞게 고치는 트랜잭션.
 * 고칠 것이 없으면 null.
 *
 * @param isNew 그 위치의 블록이 이번 변경으로 새로 들어왔는가. 같은 ID를
 *   여럿이 가지면 새로 들어오지 않은 쪽이 ID를 지킵니다.
 */
export function normalizeTemplateIds(
  state: EditorState,
  isNew: (pos: number) => boolean,
): Transaction | null {
  const blocks: Array<{ pos: number; node: PMNode }> = [];
  state.doc.descendants((node, pos) => {
    if (isTemplateNode(node)) {
      blocks.push({ pos, node });
      return false;
    }
    return !node.isTextblock;
  });
  if (blocks.length === 0) return null;

  // 같은 ID 중 누가 지키는가: 원래 있던 블록 중 앞의 것, 없으면 앞의 것.
  const keeper = new Map<string, number>();
  for (const { pos, node } of blocks) {
    const id = nodeIdOf(node);
    if (!id) continue;
    const current = keeper.get(id);
    if (current === undefined || (isNew(current) && !isNew(pos))) {
      keeper.set(id, pos);
    }
  }

  const tr = state.tr;
  let changed = false;

  for (const { pos, node } of blocks) {
    const id = nodeIdOf(node);
    if (!id || keeper.get(id) !== pos) {
      tr.setNodeAttribute(pos, "nodeId", generateNodeId());
      changed = true;
    } else if (id !== node.attrs.nodeId) {
      // 대문자 UUID. DB는 소문자로 돌려주므로 대조가 어긋납니다. 같은 값이라
      // 소문자로 바꿔도 이미 매달린 답은 그대로입니다.
      tr.setNodeAttribute(pos, "nodeId", id);
      changed = true;
    }

    if (node.type.name === "checklist") {
      const items = normalizeChecklistItems(node.attrs.items);
      if (items !== null) {
        tr.setNodeAttribute(pos, "items", items);
        changed = true;
      }
    }
  }

  return changed ? tr : null;
}

/**
 * 체크리스트 항목 키를 고친 `data-items` JSON. 고칠 것이 없으면 null.
 *
 * 앞의 항목이 키를 지키고, 비었거나 겹치거나 너무 긴 키만 새로 받습니다.
 * 키가 없는 항목을 버리지 않고 키를 주는 이유는, 버리면 크리에이터가 쓴
 * 항목 문구가 다음 저장에서 사라지기 때문입니다.
 *
 * 문자열·숫자만 적힌 항목(`["운동하기"]`)은 그 글을 문구로 한 항목이 됩니다.
 * 읽는 쪽이 객체가 아닌 항목을 버리므로, 그대로 두면 "항목 추가"를 누르는
 * 순간 HTML에서 지워집니다(4-P1-3). 숫자 문구도 같은 이유로 글로 바꿉니다.
 *
 * JSON이 아니거나 배열이 아니면 손대지 않습니다. node view가 편집을 막고
 * 안내합니다(`isChecklistItemsIntact`).
 */
export function normalizeChecklistItems(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const seen = new Set<string>();
  let changed = false;

  const freshKey = () => {
    let fresh = generateFieldKey();
    while (seen.has(fresh)) fresh = generateFieldKey();
    seen.add(fresh);
    changed = true;
    return fresh;
  };

  const next = parsed.map((entry: unknown) => {
    if (typeof entry === "string" || typeof entry === "number") {
      return { id: freshKey(), text: String(entry) };
    }
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return entry;
    }
    let item = entry as { id?: unknown; text?: unknown };
    if (typeof item.text === "number") {
      item = { ...item, text: String(item.text) };
      changed = true;
    }
    const id = item.id;
    if (isStorableFieldKey(id) && !seen.has(id)) {
      seen.add(id);
      return item;
    }
    return { ...item, id: freshKey() };
  });

  return changed ? JSON.stringify(next) : null;
}

/**
 * 붙여넣는 블록에 새 ID를 줍니다. 같은 책에서 잘라낸 블록이고 지금 문서에
 * 없으면 원래 ID를 한 번만 돌려줍니다 — 같은 것을 두 번 붙이면 두 번째는
 * 복사본입니다.
 */
function assignPastedIds(slice: Slice, doc: PMNode, scope: string): Slice {
  const present = new Set<string>();
  doc.descendants((node) => {
    if (!isTemplateNode(node)) return !node.isTextblock;
    const id = nodeIdOf(node);
    if (id) present.add(id);
    return false;
  });

  const cut = cutIds(scope);
  let changed = false;

  const content = mapFragment(slice.content, (node) => {
    if (!isTemplateNode(node)) return node;

    const id = nodeIdOf(node);
    if (id && cut.has(id) && !present.has(id)) {
      cut.delete(id);
      present.add(id);
      return node;
    }

    changed = true;
    return node.type.create(
      { ...node.attrs, nodeId: generateNodeId() },
      node.content,
      node.marks,
    );
  });

  return changed ? new Slice(content, slice.openStart, slice.openEnd) : slice;
}

function mapFragment(
  fragment: Fragment,
  map: (node: PMNode) => PMNode,
): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((child) => {
    const mapped = map(child);
    nodes.push(
      mapped === child && child.content.size > 0
        ? child.copy(mapFragment(child.content, map))
        : mapped,
    );
  });
  return Fragment.fromArray(nodes);
}

function rangesContainTemplate(
  doc: PMNode,
  ranges: ReadonlyArray<[number, number]>,
): boolean {
  const size = doc.content.size;
  return ranges.some(([from, to]) => {
    const start = Math.max(0, Math.min(from, size));
    const end = Math.max(start, Math.min(to, size));
    let found = false;
    doc.nodesBetween(start, end, (node) => {
      if (found) return false;
      if (isTemplateNode(node)) found = true;
      return !found && !node.isTextblock;
    });
    return found;
  });
}

function forgetIdsPresentIn(doc: PMNode, scope: string): void {
  const cut = cutIdsByScope.get(scope);
  if (!cut || cut.size === 0) return;
  doc.descendants((node) => {
    if (!isTemplateNode(node)) return !node.isTextblock;
    const id = nodeIdOf(node);
    if (id) cut.delete(id);
    return false;
  });
}

/**
 * 이번 트랜잭션들이 새로 넣은 범위(최종 문서 좌표).
 *
 * 각 스텝이 넣은 범위를 그 뒤의 스텝들로 옮겨 최종 문서 위치로 맞춥니다.
 * 이 범위 밖의 블록은 원래 문서에 있던 블록입니다.
 */
function insertedRanges(
  transactions: readonly Transaction[],
): Array<[number, number]> {
  let ranges: Array<[number, number]> = [];

  for (const tr of transactions) {
    ranges = ranges.map(([from, to]) => [
      tr.mapping.map(from, -1),
      tr.mapping.map(to, 1),
    ]);

    tr.mapping.maps.forEach((stepMap, index) => {
      const rest = tr.mapping.slice(index + 1);
      stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        if (newEnd > newStart) {
          ranges.push([rest.map(newStart, -1), rest.map(newEnd, 1)]);
        }
      });
    });
  }

  return ranges;
}
