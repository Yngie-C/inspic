import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Element, htmlToDOM } from "html-react-parser";
import type { DOMNode } from "html-react-parser";
import ChecklistReader from "./ChecklistReader";
import { WorkbookResponsesProvider } from "../WorkbookResponsesProvider";
import type {
  LoadedResponse,
  WorkbookResponseClient,
} from "@/lib/workbook/response-client";
import type { ResponseWrite } from "@/lib/workbook/response-payload";

/**
 * 저장·복원을 화면 단에서 한 번 더 확인합니다. 도메인 단위 테스트가
 * 통과해도, 리더가 응답을 인덱스로 다시 매칭하면 같은 버그가 돌아옵니다.
 */

const BOOK = "book-1";
const BLOCK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_BLOCK_ID = "22222222-2222-4222-8222-222222222222";

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

function checkedResponse(
  fieldKey: string,
  blockId = BLOCK_ID,
): LoadedResponse {
  return {
    block_id: blockId,
    field_key: fieldKey,
    value_text: null,
    value_number: null,
    value_bool: true,
    updated_at: "2026-10-01T00:00:00Z",
    written_at: null,
  };
}

function fakeClient(stored: LoadedResponse[] = []) {
  const batches: ResponseWrite[][] = [];
  const client: WorkbookResponseClient & { batches: ResponseWrite[][] } = {
    batches,
    load: vi.fn(async () => stored),
    save: vi.fn(async (_bookId, writes) => {
      batches.push([...writes]);
      return { saved: writes.length, rejected: [] };
    }),
  };
  return client;
}

function renderChecklist(
  items: Array<{ id: string; text: string }>,
  options?: { blockId?: string; client?: ReturnType<typeof fakeClient> },
) {
  const client = options?.client ?? fakeClient();
  const result = render(
    <WorkbookResponsesProvider
      bookId={BOOK}
      canSave
      viewerId="reader-1"
      client={client}
      debounceMs={0}
    >
      <ChecklistReader element={checklistElement(items, options?.blockId)} />
    </WorkbookResponsesProvider>,
  );
  return { ...result, client };
}

const ITEMS = [
  { id: "a", text: "물 마시기" },
  { id: "b", text: "산책하기" },
  { id: "c", text: "일기 쓰기" },
];

describe("ChecklistReader", () => {
  it("문항을 정의 순서대로 그린다", async () => {
    renderChecklist(ITEMS);

    expect(await screen.findAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByLabelText("물 마시기")).not.toBeChecked();
  });

  it("저장된 체크를 복원한다", async () => {
    renderChecklist(ITEMS, { client: fakeClient([checkedResponse("b")]) });

    await waitFor(() =>
      expect(screen.getByLabelText("산책하기")).toBeChecked(),
    );
    expect(screen.getByLabelText("물 마시기")).not.toBeChecked();
  });

  it("체크하면 그 항목의 field_key로 저장한다", async () => {
    const user = userEvent.setup();
    const { client } = renderChecklist(ITEMS);

    await user.click(await screen.findByLabelText("산책하기"));

    await waitFor(() =>
      expect(client.batches.at(-1)).toEqual([
        expect.objectContaining({ block_id: BLOCK_ID, field_key: "b", value: true }),
      ]),
    );
  });

  it("체크 해제는 미응답이 아니라 false로 저장한다", async () => {
    // 미응답과 "안 함"은 다릅니다. 크리에이터 지표가 둘을 구분합니다.
    const user = userEvent.setup();
    const { client } = renderChecklist(ITEMS, {
      client: fakeClient([checkedResponse("b")]),
    });

    await waitFor(() =>
      expect(screen.getByLabelText("산책하기")).toBeChecked(),
    );
    await user.click(screen.getByLabelText("산책하기"));

    await waitFor(() =>
      expect(client.batches.at(-1)).toEqual([
        expect.objectContaining({ block_id: BLOCK_ID, field_key: "b", value: false }),
      ]),
    );
  });

  it("크리에이터가 앞에 문항을 끼워 넣어도 체크가 밀리지 않는다", async () => {
    // 크리에이터가 원고를 고쳤다: 맨 앞에 문항 추가 + 중간 문항 삭제.
    // 응답은 (block_id, field_key)로만 붙으므로 자리는 상관없습니다.
    const edited = [
      { id: "새-항목", text: "명상하기" },
      { id: "a", text: "물 마시기" },
      { id: "c", text: "일기 쓰기" },
    ];
    renderChecklist(edited, { client: fakeClient([checkedResponse("c")]) });

    await waitFor(() =>
      expect(screen.getByLabelText("일기 쓰기")).toBeChecked(),
    );
    expect(screen.getByLabelText("명상하기")).not.toBeChecked();
    expect(screen.getByLabelText("물 마시기")).not.toBeChecked();
  });

  it("다른 블록의 응답을 가져오지 않는다", async () => {
    renderChecklist(ITEMS, {
      client: fakeClient([checkedResponse("a", OTHER_BLOCK_ID)]),
    });

    await waitFor(() =>
      expect(screen.getAllByRole("checkbox")).toHaveLength(3),
    );
    expect(screen.getByLabelText("물 마시기")).not.toBeChecked();
  });
});
