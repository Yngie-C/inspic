import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Element, htmlToDOM } from "html-react-parser";
import type { DOMNode } from "html-react-parser";
import ReflectionReader from "./templates/ReflectionReader";
import { SaveStatusBadge } from "./SaveStatusBadge";
import { WorkbookResponsesProvider } from "./WorkbookResponsesProvider";
import {
  ResponseSaveRejectedError,
  type LoadedResponse,
  type SaveResponsesResult,
  type WorkbookResponseClient,
} from "@/lib/workbook/response-client";
import {
  readResponseCache,
  writeResponseCache,
  type UnsentMarks,
} from "@/lib/workbook/response-cache";
import type { ResponseWrite } from "@/lib/workbook/response-payload";

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

const BOOK = "22222222-2222-4222-8222-222222222222";
const BLOCK = "11111111-1111-4111-8111-111111111111";
const VIEWER = "reader-1";

/**
 * 캐시는 프로덕션 코드로 심습니다.
 *
 * 키를 테스트에서 손으로 만들면 프로덕션의 키 규칙이 바뀌어도 서로
 * 만나지 않아, 캐시가 아예 안 읽히는데 테스트는 초록불이 됩니다.
 */
function seedCache(
  viewerId: string | null,
  answer: string,
  options?: { unsentAt?: number; rejectedAt?: number },
) {
  const mark = (at: number | undefined): UnsentMarks =>
    at === undefined ? {} : { [BLOCK]: { answer: at } };
  writeResponseCache(BOOK, viewerId, {
    answers: { [BLOCK]: { answer } },
    unsent: mark(options?.unsentAt),
    rejected: mark(options?.rejectedAt),
  });
}

function reflectionElement(blockId = BLOCK): Element {
  const [node] = htmlToDOM(
    `<section data-template-type="reflection" data-node-id="${blockId}" data-prompt="오늘 무엇을 배웠나요?"></section>`,
  ) as DOMNode[];
  return node as Element;
}

function textResponse(
  value: string,
  blockId = BLOCK,
  updatedAt = "2026-10-01T00:00:00Z",
): LoadedResponse {
  return {
    block_id: blockId,
    field_key: "answer",
    value_text: value,
    value_number: null,
    value_bool: null,
    updated_at: updatedAt,
    written_at: null,
  };
}

interface FakeClient extends WorkbookResponseClient {
  batches: ResponseWrite[][];
}

function fakeClient(options?: {
  stored?: LoadedResponse[];
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
        expect.objectContaining({ block_id: BLOCK, field_key: "answer", value: "답" }),
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
      expect.objectContaining({ block_id: BLOCK, field_key: "answer", value: "답" }),
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

const BLOCK_2 = "33333333-3333-4333-8333-333333333333";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderTwoReflections(client: WorkbookResponseClient) {
  render(
    <WorkbookResponsesProvider
      bookId={BOOK}
      canSave
      viewerId={VIEWER}
      client={client}
      debounceMs={0}
    >
      <SaveStatusBadge />
      <div data-testid="first">
        <ReflectionReader element={reflectionElement(BLOCK)} />
      </div>
      <div data-testid="second">
        <ReflectionReader element={reflectionElement(BLOCK_2)} />
      </div>
    </WorkbookResponsesProvider>,
  );
  return {
    first: within(screen.getByTestId("first")),
    second: within(screen.getByTestId("second")),
  };
}

describe("저장 순서와 실패 (코드 리뷰 3단계 P0)", () => {
  it("4xx로 거절된 답은 큐에서 빠지고, 다음 저장은 다른 답만 보내 성공한다", async () => {
    // 예전에는 거절된 배치가 큐에 남아 다음 저장마다 다시 실렸고, 그 세션의
    // 저장이 전부 실패했습니다(3-P0-1).
    const user = userEvent.setup();
    let calls = 0;
    const client = fakeClient({
      onSave: async (writes) => {
        calls += 1;
        if (calls === 1) throw new ResponseSaveRejectedError(400);
        return { saved: writes.length, rejected: [] };
      },
    });
    const { first, second } = renderTwoReflections(client);

    await user.type(await first.findByRole("textbox"), "가");
    expect(await first.findByText("저장 안 됨")).toBeInTheDocument();

    await user.type(second.getByRole("textbox"), "나");

    await waitFor(() =>
      expect(client.batches.at(-1)).toEqual([
        expect.objectContaining({ block_id: BLOCK_2, field_key: "answer", value: "나" }),
      ]),
    );
    expect(await second.findByText(/저장됨/)).toBeInTheDocument();
    // 거절된 답은 화면에 그대로 남습니다.
    expect(first.getByRole("textbox")).toHaveValue("가");
  });

  it("저장 중에 또 쓰면 겹쳐 보내지 않고, 끝난 뒤 새 값을 보낸다", async () => {
    // 겹쳐 보내면 늦게 출발한 'ab'가 먼저 커밋되고 'a'가 그 위를 덮습니다(3-P0-3).
    const user = userEvent.setup();
    const first = deferred<SaveResponsesResult>();
    let inFlight = 0;
    let maxInFlight = 0;
    const client = fakeClient({
      onSave: async (writes) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          if (client.batches.length === 1) return await first.promise;
          return { saved: writes.length, rejected: [] };
        } finally {
          inFlight -= 1;
        }
      },
    });
    renderReflection(client);

    const textarea = await screen.findByRole("textbox");
    await user.type(textarea, "a");
    await waitFor(() => expect(client.batches).toHaveLength(1));

    await user.type(textarea, "b");
    // 첫 저장이 끝나기 전에는 두 번째가 나가지 않습니다.
    await new Promise((done) => setTimeout(done, 20));
    expect(client.batches).toHaveLength(1);

    await act(async () => first.resolve({ saved: 1, rejected: [] }));

    await waitFor(() =>
      expect(client.batches.at(-1)).toEqual([
        expect.objectContaining({ block_id: BLOCK, field_key: "answer", value: "ab" }),
      ]),
    );
    expect(maxInFlight).toBe(1);
    expect(await screen.findByText("저장됨")).toBeInTheDocument();
  });

  it("저장 중에 페이지를 떠나면, 그 저장이 끝난 뒤 남은 답을 keepalive로 이어 보낸다", async () => {
    // 예전에는 진행 중이면 그냥 돌아가, 마지막 디바운스 구간의 답이 다음에
    // 이 책을 열 때까지 가지 않았습니다(WP5 리뷰).
    const user = userEvent.setup();
    const firstSave = deferred<SaveResponsesResult>();
    const keepalives: boolean[] = [];
    const client: WorkbookResponseClient & { batches: ResponseWrite[][] } = {
      batches: [],
      load: vi.fn(async () => []),
      save: vi.fn(async (_bookId, writes, options) => {
        client.batches.push([...writes]);
        keepalives.push(options?.keepalive ?? false);
        if (client.batches.length === 1) return firstSave.promise;
        return { saved: writes.length, rejected: [] };
      }),
    };
    render(
      <WorkbookResponsesProvider
        bookId={BOOK}
        canSave
        viewerId={VIEWER}
        client={client}
        debounceMs={0}
      >
        <ReflectionReader element={reflectionElement()} />
      </WorkbookResponsesProvider>,
    );

    const textarea = await screen.findByRole("textbox");
    await user.type(textarea, "a");
    await waitFor(() => expect(client.batches).toHaveLength(1));
    await user.type(textarea, "b");

    window.dispatchEvent(new Event("pagehide"));
    await act(async () => firstSave.resolve({ saved: 1, rejected: [] }));

    await waitFor(() =>
      expect(client.batches.at(-1)).toEqual([
        expect.objectContaining({ value: "ab" }),
      ]),
    );
    expect(keepalives.at(-1)).toBe(true);
  });

  it("캐시에만 있던 미전송 답을 열 때 서버로 보낸다", async () => {
    // 구매 전 미리보기에서 쓴 답, 저장 실패 뒤 새로고침한 답입니다(3-P0-4).
    seedCache(VIEWER, "아직 못 보낸 답", { unsentAt: Date.now() });
    const client = fakeClient({ stored: [] });

    renderReflection(client);

    expect(await screen.findByDisplayValue("아직 못 보낸 답")).toBeInTheDocument();
    await waitFor(() =>
      expect(client.batches.at(-1)).toEqual([
        expect.objectContaining({ block_id: BLOCK, field_key: "answer", value: "아직 못 보낸 답" }),
      ]),
    );
    // 서버가 받았으면 미전송 표시가 지워집니다.
    await waitFor(() =>
      expect(readResponseCache(BOOK, VIEWER).unsent).toEqual({}),
    );
  });

  it("서버 값이 미전송 답보다 나중에 고쳐졌으면 서버를 따르고 보내지 않는다", async () => {
    // 다른 기기에서 더 나중에 쓴 답을 옛 기기의 캐시가 덮으면 안 됩니다.
    seedCache(VIEWER, "옛 기기에서 못 보낸 답", {
      unsentAt: Date.parse("2026-09-01T00:00:00Z"),
    });
    const client = fakeClient({
      stored: [textResponse("다른 기기의 새 답", BLOCK, "2026-10-01T00:00:00Z")],
    });

    renderReflection(client);

    expect(await screen.findByDisplayValue("다른 기기의 새 답")).toBeInTheDocument();
    await new Promise((done) => setTimeout(done, 20));
    expect(client.save).not.toHaveBeenCalled();
  });

  it("불러오는 중에 쓴 답이 불러온 값에 지워지지 않는다", async () => {
    // 예전에는 await 전에 찍은 캐시로 통째로 바꿔 화면에서 사라졌습니다(3-P0-5).
    const user = userEvent.setup();
    const loading = deferred<LoadedResponse[]>();
    const client = fakeClient();
    client.load = vi.fn(() => loading.promise);
    renderReflection(client);

    const textarea = await screen.findByRole("textbox");
    await user.type(textarea, "기다리며 쓴 답");

    await act(async () =>
      loading.resolve([textResponse("서버의 옛 답", BLOCK, "2026-09-01T00:00:00Z")]),
    );

    expect(textarea).toHaveValue("기다리며 쓴 답");
    await waitFor(() =>
      expect(client.batches.at(-1)).toEqual([
        expect.objectContaining({ block_id: BLOCK, field_key: "answer", value: "기다리며 쓴 답" }),
      ]),
    );
  });

  it("거절된 블록이 있으면 다른 블록이 저장돼도 책 전체를 저장됨으로 올리지 않는다", async () => {
    // 뒤이은 성공이 실패 표시를 지워 거절된 답이 저장된 것처럼 보였습니다(3-P1-5).
    const user = userEvent.setup();
    const client = fakeClient({
      onSave: async (writes) => ({
        saved: writes.filter((write) => write.block_id !== BLOCK).length,
        rejected: writes
          .filter((write) => write.block_id === BLOCK)
          .map((write) => ({
            block_id: write.block_id,
            field_key: write.field_key,
            reason: "unknown_field" as const,
          })),
      }),
    });
    const { first, second } = renderTwoReflections(client);

    await user.type(await first.findByRole("textbox"), "가");
    expect(await first.findByText("저장 안 됨")).toBeInTheDocument();
    expect(
      first.getByText(/저자가 이 부분을 고치는 중일 수 있어요/),
    ).toBeInTheDocument();

    await user.type(second.getByRole("textbox"), "나");

    expect(await second.findByText(/저장됨/)).toBeInTheDocument();
    // 실패는 블록 단위입니다. 두 번째 블록은 실패한 적이 없습니다.
    expect(second.queryByText("저장 안 됨")).not.toBeInTheDocument();
    expect(screen.getByText(/저장 실패/)).toBeInTheDocument();
  });

  it("불러오기가 실패한 뒤 다시 시도하면 다시 불러온다", async () => {
    // 예전 retry는 큐만 다시 보내서, 큐가 비면 빨간 배지가 그대로 남았습니다.
    const user = userEvent.setup();
    let failing = true;
    const client = fakeClient();
    client.load = vi.fn(async () => {
      if (failing) throw new Error("offline");
      return [textResponse("서버의 답")];
    });
    renderReflection(client);

    const retry = await screen.findByText(/저장 실패/);
    failing = false;
    await user.click(retry);

    expect(await screen.findByDisplayValue("서버의 답")).toBeInTheDocument();
    expect(screen.queryByText(/저장 실패/)).not.toBeInTheDocument();
    expect(client.load).toHaveBeenCalledTimes(2);
  });

  it("계정이 바뀌면 이전 사람의 큐를 새 계정으로 보내지 않는다", async () => {
    // 정리 시점의 쿠키는 이미 새 세션이라, 보내면 A의 답이 B의 행이 됩니다(3-P1-6).
    const user = userEvent.setup();
    const client = fakeClient();
    const view = (viewerId: string) => (
      <WorkbookResponsesProvider
        bookId={BOOK}
        canSave
        viewerId={viewerId}
        client={client}
        debounceMs={60_000}
      >
        <ReflectionReader element={reflectionElement()} />
      </WorkbookResponsesProvider>
    );
    const { rerender } = render(view("reader-a"));

    await user.type(await screen.findByRole("textbox"), "A의 답");
    rerender(view("reader-b"));

    await new Promise((done) => setTimeout(done, 20));
    expect(client.save).not.toHaveBeenCalled();
    // A의 답은 A의 칸에 미전송으로 남아, A가 다시 열 때 갑니다.
    const leftover = readResponseCache(BOOK, "reader-a");
    expect(leftover.answers[BLOCK]?.answer).toBe("A의 답");
    expect(leftover.unsent[BLOCK]?.answer).toEqual(expect.any(Number));
  });

  it("ID가 없는 블록은 입력을 받지 않고 그렇다고 알린다", async () => {
    // ID 없는 블록끼리 답 하나를 나눠 갖고, 서버는 그 답을 거절합니다(3-P0-1).
    const user = userEvent.setup();
    const client = fakeClient();
    const [node] = htmlToDOM(
      `<section data-template-type="reflection" data-prompt="질문"></section>`,
    ) as DOMNode[];
    render(
      <WorkbookResponsesProvider
        bookId={BOOK}
        canSave
        viewerId={VIEWER}
        client={client}
        debounceMs={0}
      >
        <ReflectionReader element={node as Element} />
      </WorkbookResponsesProvider>,
    );

    const textarea = await screen.findByRole("textbox");
    await user.type(textarea, "답");

    expect(textarea).toHaveValue("");
    expect(textarea).toHaveAttribute("readonly");
    expect(screen.getByText(/아직 답을 받을 수 없어요/)).toBeInTheDocument();
    expect(client.save).not.toHaveBeenCalled();
  });

  it("긴 답은 서버 상한에서 더 받지 않는다", async () => {
    renderReflection(fakeClient());
    expect(await screen.findByRole("textbox")).toHaveAttribute("maxlength", "20000");
  });
});

