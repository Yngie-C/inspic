import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Element, htmlToDOM } from "html-react-parser";
import type { DOMNode } from "html-react-parser";
import ChecklistReader from "./ChecklistReader";

/**
 * 저장·복원을 화면 단에서 한 번 더 확인합니다. 도메인 단위 테스트가
 * 통과해도, 리더가 응답을 인덱스로 다시 매칭하면 같은 버그가 돌아옵니다.
 */

const CHAPTER_ID = "chapter-1";
const BLOCK_ID = "block-1";

function checklistElement(
  items: Array<{ id: string; text: string }>,
  blockId = BLOCK_ID,
): Element {
  const encoded = JSON.stringify(items).replace(/"/g, "&quot;");
  const [node] = htmlToDOM(
    `<section data-template-type="checklist" data-node-id="${blockId}" data-items="${encoded}"></section>`,
  ) as DOMNode[];
  return node as Element;
}

const ITEMS = [
  { id: "a", text: "물 마시기" },
  { id: "b", text: "산책하기" },
  { id: "c", text: "일기 쓰기" },
];

describe("ChecklistReader", () => {
  it("문항을 정의 순서대로 그린다", () => {
    render(
      <ChecklistReader element={checklistElement(ITEMS)} chapterId={CHAPTER_ID} />,
    );

    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByLabelText("물 마시기")).not.toBeChecked();
  });

  it("체크한 내용을 다시 열었을 때 복원한다", async () => {
    const user = userEvent.setup();

    const first = render(
      <ChecklistReader element={checklistElement(ITEMS)} chapterId={CHAPTER_ID} />,
    );
    await user.click(screen.getByLabelText("산책하기"));
    expect(screen.getByLabelText("산책하기")).toBeChecked();
    first.unmount();

    render(
      <ChecklistReader element={checklistElement(ITEMS)} chapterId={CHAPTER_ID} />,
    );
    expect(await screen.findByLabelText("산책하기")).toBeChecked();
    expect(screen.getByLabelText("물 마시기")).not.toBeChecked();
  });

  it("크리에이터가 앞에 문항을 끼워 넣어도 체크가 밀리지 않는다", async () => {
    const user = userEvent.setup();

    const first = render(
      <ChecklistReader element={checklistElement(ITEMS)} chapterId={CHAPTER_ID} />,
    );
    await user.click(screen.getByLabelText("일기 쓰기"));
    first.unmount();

    // 크리에이터가 원고를 고쳤다: 맨 앞에 문항 추가 + 중간 문항 삭제.
    const edited = [
      { id: "새-항목", text: "명상하기" },
      { id: "a", text: "물 마시기" },
      { id: "c", text: "일기 쓰기" },
    ];
    render(
      <ChecklistReader
        element={checklistElement(edited)}
        chapterId={CHAPTER_ID}
      />,
    );

    expect(await screen.findByLabelText("일기 쓰기")).toBeChecked();
    expect(screen.getByLabelText("명상하기")).not.toBeChecked();
    expect(screen.getByLabelText("물 마시기")).not.toBeChecked();
  });

  it("다른 블록의 응답을 가져오지 않는다", async () => {
    const user = userEvent.setup();

    const first = render(
      <ChecklistReader element={checklistElement(ITEMS)} chapterId={CHAPTER_ID} />,
    );
    await user.click(screen.getByLabelText("물 마시기"));
    first.unmount();

    render(
      <ChecklistReader
        element={checklistElement(ITEMS, "다른-블록")}
        chapterId={CHAPTER_ID}
      />,
    );

    expect(screen.getByLabelText("물 마시기")).not.toBeChecked();
  });
});
