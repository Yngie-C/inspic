import type { Editor, Range } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import {
  BarChart3,
  CheckSquare,
  HelpCircle,
  MessageSquare,
  Target,
  type LucideIcon,
} from "lucide-react";

export type WorkbookBlockType =
  | "checklist"
  | "reflection"
  | "smartGoal"
  | "scale"
  | "callout";

export interface WorkbookBlockItem {
  type: WorkbookBlockType;
  title: string;
  description: string;
  aliases: string[];
  icon: LucideIcon;
}

/**
 * 저자가 넣을 수 있는 워크북 블록. 툴바 메뉴와 슬래시 메뉴가 이 목록 하나를
 * 씁니다 — 두 벌 두면 이름·순서·설명이 갈라집니다.
 *
 * 제목은 블록 라벨(DESIGN.md Voice)과 같게 둡니다. 독자가 쓰는 블록 4종을
 * 먼저, 입력이 없는 참고를 마지막에 둡니다.
 */
export const WORKBOOK_BLOCKS: readonly WorkbookBlockItem[] = [
  {
    type: "checklist",
    title: "체크리스트",
    description: "독자가 항목을 하나씩 체크해요",
    aliases: ["checklist", "체크", "할일"],
    icon: CheckSquare,
  },
  {
    type: "reflection",
    title: "성찰",
    description: "독자가 질문에 자기 답을 적어요",
    aliases: ["reflection", "리플렉션", "질문", "성찰 질문"],
    icon: HelpCircle,
  },
  {
    type: "smartGoal",
    title: "목표",
    description: "SMART 다섯 칸으로 목표를 세워요",
    aliases: ["smart", "goal", "목표 설정"],
    icon: Target,
  },
  {
    type: "scale",
    title: "척도",
    description: "1–10 중 하나를 골라 지금 상태를 재요",
    aliases: ["scale", "스케일", "점수"],
    icon: BarChart3,
  },
  {
    type: "callout",
    title: "참고",
    description: "팁·주의를 본문과 구분해 보여 줘요",
    aliases: ["callout", "콜아웃", "팁", "주의", "알림", "안내"],
    icon: MessageSquare,
  },
];

/**
 * 워크북 블록을 넣습니다. `range`는 슬래시 명령이 지울 `/검색어` 자리입니다.
 *
 * 블록이 선택된 채로(블록을 클릭하면 NodeSelection) 그냥 `insertContent`를
 * 하면 선택된 블록이 새 블록으로 바뀝니다 — 기존 블록과 그 ID에 매달린 독자
 * 답이 사라지므로, 그때는 선택한 블록 뒤에 넣습니다. ID는 여기서 만들지 않고
 * `TemplateNodeIds`가 부여합니다.
 */
export function insertWorkbookBlock(
  editor: Editor,
  type: WorkbookBlockType,
  range?: Range,
): void {
  if (range) {
    editor.chain().focus().deleteRange(range).insertContent({ type }).run();
    return;
  }
  const { selection } = editor.state;
  if (selection instanceof NodeSelection) {
    editor.chain().focus().insertContentAt(selection.to, { type }).run();
    return;
  }
  editor.chain().focus().insertContent({ type }).run();
}
