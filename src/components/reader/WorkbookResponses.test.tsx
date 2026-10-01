import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Element, htmlToDOM } from "html-react-parser";
import type { DOMNode } from "html-react-parser";
import ReflectionReader from "./templates/ReflectionReader";
import { SaveStatusBadge } from "./SaveStatusBadge";
import { WorkbookResponsesProvider } from "./WorkbookResponsesProvider";
import type {
  SaveResponsesResult,
  WorkbookResponseClient,
} from "@/lib/workbook/response-client";
import { writeResponseCache } from "@/lib/workbook/response-cache";
import type { ResponseWrite } from "@/lib/workbook/response-payload";
import type { WorkbookResponse } from "@/lib/workbook/types";

/**
 * 독자 루프의 저장 규약.
 *
 * M3의 게이트는 "기기 A에서 쓰고 기기 B에서 이어서 쓴다"입니다. 그러려면
 * 화면이 믿어야 하는 것이 브라우저 저장소가 아니라 서버여야 합니다.
 * 여기서 고정하는 것:
 *
 * - 서버 값이 이 기기의 캐시를 이긴다 (아니면 옛 기기의 답이 되살아납니다)
 * - 화면은 즉시 바뀌고 저장은 뒤따른다 (낙관적)
 * - 저장이 실패해도 쓴 값은 사라지지 않고, 실패했다고 말한다
 */

const BOOK = "book-1";
const BLOCK = "11111111-1111-4111-8111-111111111111";
const VIEWER = "reader-1";

/**
 * 캐시는 프로덕션 코드로 심습니다.
 *
 * 키를 테스트에서 손으로 만들면 프로덕션의 키 규칙이 바뀌어도 서로
 * 만나지 않아, 캐시가 아예 안 읽히는데 테스트는 초록불이 됩니다.
 */
function seedCache(viewerId: string | null, answer: string) {
  writeResponseCache(BOOK, viewerId, { [BLOCK]: { answer } });
}

function reflectionElement(blockId = BLOCK): Element {
  const [node] = htmlToDOM(
    `<section data-template-type="reflection" data-node-id="${blockId}" data-prompt="오늘 무엇을 배웠나요?"></section>`,
  ) as DOMNode[];
  return node as Element;
}

function textResponse(value: string, blockId = BLOCK): WorkbookResponse {
  return {
    block_id: blockId,
    field_key: "answer",
    value_text: value,
    value_number: null,
    value_bool: null,
  };
}

interface FakeClient extends WorkbookResponseClient {
  batches: ResponseWrite[][];
}

function fakeClient(options?: {
  stored?: WorkbookResponse[];
  onSave?: (writes: readonly ResponseWrite[]) => Promise<SaveResponsesResult>;
  failLoad?: boolean;
}): FakeClient {
  const batches: ResponseWrite[][] = [];

  return {
    batches,
    load: vi.fn(async () => {
      if (options?.failLoad) throw new Error("offline");
      return options?.stored ?? [];
    }),
    save: vi.fn(async (_bookId, writes) => {
      batches.push([...writes]);
      if (options?.onSave) return options.onSave(writes);
      return { saved: writes.length, rejected: [] };
    }),
  };
}

function renderReflection(
  client: WorkbookResponseClient,
  canSave = true,
  viewerId: string | null = VIEWER,
  isPreview = false,
) {
  return render(
    <WorkbookResponsesProvider
      bookId={BOOK}
      canSave={canSave}
      viewerId={viewerId}
      client={client}
      debounceMs={0}
    >
      <SaveStatusBadge isPreview={isPreview} />
      <ReflectionReader element={reflectionElement()} />
    </WorkbookResponsesProvider>,
  );
}

describe("워크북 응답 저장", () => {
  it("서버에 저장된 응답을 복원한다", async () => {
    // 기기 B에서 열었을 때 기기 A에서 쓴 내용이 보여야 합니다.
    renderReflection(fakeClient({ stored: [textResponse("어제 쓴 답")] }));

    expect(await screen.findByDisplayValue("어제 쓴 답")).toBeInTheDocument();
  });

  it("서버 값이 이 기기의 캐시를 이긴다", async () => {
    seedCache(VIEWER, "이 기기의 옛 답");

    renderReflection(fakeClient({ stored: [textResponse("다른 기기의 새 답")] }));

    expect(
      await screen.findByDisplayValue("다른 기기의 새 답"),
    ).toBeInTheDocument();
  });

  it("비로그인일 때 쓴 답이 로그인 화면으로 넘어오지 않는다", async () => {
    // 무료 책과 유료 책 첫 챕터는 비로그인도 읽습니다. 같은 기기에서
    // 익명으로 쓰다가 로그인하는 것이 정상 경로인데, 캐시 칸을 나누지
    // 않으면 익명일 때 쓴 답이 로그인 화면에 그대로 떠오릅니다.
    // 그 값은 서버로 보낼 큐에 없으므로 "저장된 것처럼 보이지만
    // 아무 데도 저장되지 않은" 상태가 됩니다.
    seedCache(null, "익명일 때 쓴 답");

    renderReflection(fakeClient({ stored: [] }), true, VIEWER);

    const textarea = await screen.findByRole("textbox");
    expect(textarea).toHaveValue("");
  });

  it("비로그인 방문자에게는 자기 칸의 캐시를 돌려준다", async () => {
    seedCache(null, "익명일 때 쓴 답");

    // 저장할 수 없는 상태이므로 서버를 부르지 않습니다.
    renderReflection(fakeClient(), false, null);

    expect(
      await screen.findByDisplayValue("익명일 때 쓴 답"),
    ).toBeInTheDocument();
  });

  it("입력하면 화면이 먼저 바뀌고 저장이 뒤따른다", async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    renderReflection(client);

    const textarea = await screen.findByRole("textbox");
    await user.type(textarea, "답");

    expect(textarea).toHaveValue("답");
    await waitFor(() =>
      expect(client.batches.at(-1)).toEqual([
        { block_id: BLOCK, field_key: "answer", value: "답" },
      ]),
    );
    expect(await screen.findByText("저장됨")).toBeInTheDocument();
  });

  it("저장이 실패해도 쓴 값은 남고 실패했다고 말한다", async () => {
    const user = userEvent.setup();
    const client: WorkbookResponseClient = {
      load: vi.fn(async () => []),
      save: vi.fn(async () => {
        throw new Error("network");
      }),
    };
    renderReflection(client);

    const textarea = await screen.findByRole("textbox");
    await user.type(textarea, "잃으면 안 되는 문장");

    expect(textarea).toHaveValue("잃으면 안 되는 문장");
    expect(await screen.findByText(/저장 실패/)).toBeInTheDocument();
  });

  it("다시 시도를 누르면 실패한 배치를 다시 보낸다", async () => {
    const user = userEvent.setup();
    let failing = true;
    const client = fakeClient({
      onSave: async (writes) => {
        if (failing) throw new Error("network");
        return { saved: writes.length, rejected: [] };
      },
    });
    renderReflection(client);

    await user.type(await screen.findByRole("textbox"), "답");
    const retry = await screen.findByText(/저장 실패/);

    failing = false;
    await user.click(retry);

    expect(await screen.findByText("저장됨")).toBeInTheDocument();
    expect(client.batches.at(-1)).toEqual([
      { block_id: BLOCK, field_key: "answer", value: "답" },
    ]);
  });

  it("서버가 일부를 거절하면 저장됨으로 표시하지 않는다", async () => {
    // 크리에이터가 아직 저장하지 않은 블록입니다. 저장된 척하면 독자는
    // 사라질 답을 계속 씁니다.
    const user = userEvent.setup();
    const client = fakeClient({
      onSave: async () => ({
        saved: 0,
        rejected: [
          { block_id: BLOCK, field_key: "answer", reason: "unknown_field" },
        ],
      }),
    });
    renderReflection(client);

    await user.type(await screen.findByRole("textbox"), "답");

    expect(await screen.findByText(/저장 실패/)).toBeInTheDocument();
  });

  it("저장할 수 없는 상태에서는 서버로 보내지 않고 그렇다고 알린다", async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    renderReflection(client, false);

    await user.type(await screen.findByRole("textbox"), "답");

    expect(client.save).not.toHaveBeenCalled();
    expect(client.load).not.toHaveBeenCalled();
    expect(await screen.findByText("이 기기에만 저장됨")).toBeInTheDocument();
  });

  it("미리보기에서는 같은 사실을 경고가 아니라 미리보기로 알린다", async () => {
    // 본문 안내가 info로 "미리보기로 읽고 있어요"라고 말하는데 상단만
    // 경고색이면 독자는 무언가 잘못된 줄 압니다.
    const user = userEvent.setup();
    const client = fakeClient();
    renderReflection(client, false, VIEWER, true);

    await user.type(await screen.findByRole("textbox"), "답");

    expect(client.save).not.toHaveBeenCalled();
    expect(await screen.findByText("미리보기 · 이 기기에만")).toBeInTheDocument();
    expect(screen.queryByText("이 기기에만 저장됨")).not.toBeInTheDocument();
  });

  it("불러오기가 실패하면 캐시를 보여 주고 실패를 알린다", async () => {
    renderReflection(fakeClient({ failLoad: true }));

    expect(await screen.findByText(/저장 실패/)).toBeInTheDocument();
  });

  it("provider 없이 그리면 조용히 로컬에만 저장되지 않고 터진다", () => {
    // 저장되는 줄 알았는데 아니었다가 이 화면에서 가장 나쁜 실패입니다.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(<ReflectionReader element={reflectionElement()} />),
    ).toThrow(/WorkbookResponsesProvider/);
    spy.mockRestore();
  });
});
