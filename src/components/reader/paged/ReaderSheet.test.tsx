import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReaderView, type ReaderBook } from "../ReaderView";
import { WorkbookResponsesProvider } from "../WorkbookResponsesProvider";
import type { WorkbookResponseClient } from "@/lib/workbook/response-client";
import { DEV_BOOK } from "@/app/dev/_mock/book";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeAll(() => {
  // jsdom에는 없습니다. 쪽 계산은 레이아웃이 필요해 여기서 검증하지 않습니다.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

const BLOCK = "11111111-1111-4111-8111-111111111111";

const BOOK: ReaderBook = {
  ...DEV_BOOK,
  chapters: [
    {
      ...({} as ReaderBook["chapters"][number]),
      id: "33333333-3333-4333-8333-333333333333",
      book_id: DEV_BOOK.id,
      title: "첫 장",
      order_index: 0,
      content_html: `<p>본문</p><section data-template-type="reflection" data-node-id="${BLOCK}" data-prompt="한 가지를 적어 보세요."></section>`,
    },
  ],
};

function client(): WorkbookResponseClient {
  return {
    load: vi.fn(async () => []),
    save: vi.fn(async (_bookId, writes) => ({ saved: writes.length, rejected: [] })),
  };
}

function renderReader(canSave = true) {
  return render(
    <WorkbookResponsesProvider
      bookId={BOOK.id}
      canSave={canSave}
      viewerId={canSave ? "viewer" : null}
      client={client()}
      debounceMs={0}
    >
      <ReaderView
        book={BOOK}
        access={{
          hasAccess: canSave,
          reason: canSave ? "purchased" : "preview",
          canRead: true,
          canSaveResponses: canSave,
        }}
        isLoggedIn={canSave}
      />
    </WorkbookResponsesProvider>,
  );
}

describe("쪽 넘김 리더의 워크북 카드와 시트", () => {
  it("쪽 안에는 입력이 없고, 카드에서 연 시트에서 쓴다", async () => {
    const user = userEvent.setup();
    renderReader();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    const open = await screen.findByRole("button", { name: "작성하기" });
    await user.click(open);

    const dialog = screen.getByRole("dialog", { name: "워크북 쓰기" });
    const textarea = within(dialog).getByRole("textbox");
    expect(textarea).toHaveFocus();
    await user.type(textarea, "공고부터 본다");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // 닫으면 연 버튼으로 돌아오고, 카드에는 쓴 답이 한 줄로 보인다.
    const reopen = screen.getByRole("button", { name: "이어 쓰기" });
    expect(reopen).toHaveFocus();
    expect(screen.getByText("공고부터 본다")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/저장됨/).length).toBeGreaterThan(0));
  });

  it("Tab은 시트 안에서만 돈다", async () => {
    const user = userEvent.setup();
    renderReader();
    await user.click(await screen.findByRole("button", { name: "작성하기" }));

    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("시트에서 ←를 눌러도 쪽을 넘기지 않고 글 안에서 커서만 움직인다", async () => {
    const user = userEvent.setup();
    renderReader();
    await user.click(await screen.findByRole("button", { name: "작성하기" }));
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "ab{ArrowLeft}c");
    expect(textarea).toHaveValue("acb");
  });

  it("저장할 수 없는 독자에게는 카드가 '보기'이고 시트의 칸은 막혀 있다", async () => {
    const user = userEvent.setup();
    renderReader(false);

    await user.click(await screen.findByRole("button", { name: "보기" }));
    const dialog = screen.getByRole("dialog", { name: "워크북 보기" });
    expect(within(dialog).getByRole("textbox")).toHaveAttribute("readonly");
    expect(within(dialog).getByText(/하면 여기에 바로 쓸 수 있어요/)).toBeInTheDocument();
  });
});
