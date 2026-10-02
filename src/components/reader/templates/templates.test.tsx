import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Element, htmlToDOM } from "html-react-parser";
import type { DOMNode } from "html-react-parser";
import { HtmlContentRenderer } from "../HtmlContentRenderer";
import { WorkbookResponsesProvider } from "../WorkbookResponsesProvider";
import ScaleReader from "./ScaleReader";
import { getTemplateComponent } from "./index";
import type {
  LoadedResponse,
  WorkbookResponseClient,
} from "@/lib/workbook/response-client";

const BOOK = "22222222-2222-4222-8222-222222222222";
const BLOCK = "11111111-1111-4111-8111-111111111111";

function element(html: string): Element {
  const [node] = htmlToDOM(html) as DOMNode[];
  return node as Element;
}

function clientWith(stored: LoadedResponse[]): WorkbookResponseClient {
  return {
    load: vi.fn(async () => stored),
    save: vi.fn(async (_bookId, writes) => ({ saved: writes.length, rejected: [] })),
  };
}

describe("템플릿 찾기", () => {
  it("프로토타입 키를 컴포넌트로 돌려주지 않는다", () => {
    // sanitize는 data-* 값을 거르지 않습니다. 객체 리터럴로 찾으면
    // Object의 내장 함수가 컴포넌트로 그려져 챕터 화면 전체가 깨졌습니다(3-P1-10).
    expect(getTemplateComponent("hasOwnProperty")).toBeNull();
    expect(getTemplateComponent("constructor")).toBeNull();
    expect(getTemplateComponent("__proto__")).toBeNull();
    expect(getTemplateComponent("reflection")).not.toBeNull();
  });

  it("그런 값이 든 본문도 깨지지 않고 그린다", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <HtmlContentRenderer html='<section data-template-type="toString"><p>본문</p></section>' />,
    );
    expect(screen.getByText("본문")).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("척도", () => {
  function renderScale(html: string, stored: LoadedResponse[] = []) {
    return render(
      <WorkbookResponsesProvider
        bookId={BOOK}
        canSave
        viewerId="reader"
        client={clientWith(stored)}
        debounceMs={0}
      >
        <ScaleReader element={element(html)} />
      </WorkbookResponsesProvider>,
    );
  }

  it("범위는 에디터와 같은 규칙으로 읽는다 — 0부터 시작할 수 있다", async () => {
    renderScale(
      `<section data-template-type="scale" data-node-id="${BLOCK}" data-min="0" data-max="4"></section>`,
    );
    const buttons = await screen.findAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("터무니없는 범위로 화면을 멈추지 않는다", async () => {
    renderScale(
      `<section data-template-type="scale" data-node-id="${BLOCK}" data-min="1" data-max="10000000"></section>`,
    );
    expect(await screen.findAllByRole("button")).toHaveLength(10);
  });

  it("범위 밖에 남은 옛 답은 눌린 칸 없이 예전 답이라고 말한다", async () => {
    // 저자가 범위를 줄인 뒤입니다. 맞는 칸 없이 "9 선택됨"이면 해제할 수도
    // 없었습니다(3-P1-12).
    renderScale(
      `<section data-template-type="scale" data-node-id="${BLOCK}" data-min="1" data-max="5"></section>`,
      [
        {
          block_id: BLOCK,
          field_key: "value",
          value_text: null,
          value_number: 9,
          value_bool: null,
          updated_at: "2026-10-01T00:00:00Z",
    written_at: null,
        },
      ],
    );

    // 답은 남아 있고 진행률도 "답함"으로 셉니다. "작성 전"이라 하지 않습니다.
    expect(await screen.findByText(/예전 답 9 · 다시 골라 주세요/)).toBeInTheDocument();
    expect(screen.queryByText(/9 선택됨/)).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button").every((b) => b.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
  });
});
