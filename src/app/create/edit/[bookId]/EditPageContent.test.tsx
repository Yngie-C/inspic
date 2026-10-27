import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditPageContent } from "./EditPageContent";

/**
 * 편집 화면의 장 저장 경로(코드 리뷰 11-B).
 *
 * 가짜 fetch가 장 PUT을 붙잡아 두고, 테스트가 원하는 순서로 응답합니다 —
 * 느린 응답, 순서가 뒤바뀐 완료, 장을 바꾸는 사이의 실패를 그대로 만듭니다.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ bookId: "book-1" }),
  useRouter: () => ({ push }),
}));
vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/dashboard/BookMetadataForm", () => ({ BookMetadataForm: () => null }));
vi.mock("@/components/dashboard/ExportMenu", () => ({ ExportMenu: () => null }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
// 에디터는 본문 textarea 하나로 갈음합니다. 실제 에디터처럼 content는
// 처음 값으로만 쓰고, 장이 바뀌면 key로 새로 그립니다.
vi.mock("@/components/editor", () => ({
  RichTextEditor: ({
    content,
    onUpdate,
  }: {
    content: string;
    onUpdate: (html: string) => void;
  }) => (
    <textarea
      aria-label="본문"
      defaultValue={content}
      onChange={(event) => onUpdate(event.target.value)}
    />
  ),
}));

interface ChapterRow {
  id: string;
  book_id: string;
  title: string;
  content_html: string;
  content_raw: string | null;
  status: "draft" | "published";
  order_index: number;
}

interface HeldPut {
  chapterId: string;
  body: Record<string, unknown>;
  respond: (ok: boolean) => void;
  done: boolean;
}

let chapters: ChapterRow[];
let puts: HeldPut[];
let inFlight: number;
let maxInFlight: number;
let deletes: string[];

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/books/book-1" && method === "GET") {
        return json(200, {
          data: {
            id: "book-1",
            title: "책",
            status: "draft",
            visibility: "private",
            published_at: null,
            chapters: [],
          },
        });
      }
      if (url.startsWith("/api/chapters?bookId=")) {
        return json(200, { data: chapters.map((c) => ({ ...c })) });
      }
      const match = url.match(/^\/api\/chapters\/([^/?]+)$/);
      if (match && method === "DELETE") {
        deletes.push(match[1]);
        chapters = chapters.filter((c) => c.id !== match[1]);
        return json(200, { data: { ok: true } });
      }
      if (match && method === "PUT") {
        const chapterId = match[1];
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise((resolve) => {
          const held: HeldPut = {
            chapterId,
            body,
            done: false,
            respond: (ok) => {
              if (held.done) return;
              held.done = true;
              inFlight -= 1;
              if (!ok) {
                resolve(json(500, { error: "x", code: "SERVER_ERROR" }));
                return;
              }
              const row = chapters.find((c) => c.id === chapterId);
              if (!row) {
                resolve(json(404, { error: "없음", code: "NOT_FOUND" }));
                return;
              }
              if (typeof body.title === "string") row.title = body.title;
              if (typeof body.content_html === "string") row.content_html = body.content_html;
              if (body.status === "draft" || body.status === "published") row.status = body.status;
              resolve(json(200, { data: { ...row, workbook_sync: null } }));
            },
          };
          puts.push(held);
        });
      }
      if (url.endsWith("/publish-checks")) {
        return json(200, { data: { blockers: [], warnings: [] } });
      }
      return json(404, { error: "unknown" });
    }),
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EditPageContent />
    </QueryClientProvider>,
  );
}

async function typeBody(value: string) {
  const editor = await screen.findByLabelText("본문");
  fireEvent.change(editor, { target: { value } });
}

/** 디바운스(본문 3초)를 지나 보냅니다. */
async function passDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(3100);
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

const titleInput = () => screen.getByPlaceholderText("장 제목") as HTMLInputElement;
const bodyPuts = () => puts.filter((p) => "content_html" in p.body);
const openPuts = () => puts.filter((p) => !p.done);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  chapters = [
    { id: "a", book_id: "book-1", title: "1장", content_html: "<p>a</p>", content_raw: null, status: "draft", order_index: 0 },
    { id: "b", book_id: "book-1", title: "2장", content_html: "<p>b</p>", content_raw: null, status: "draft", order_index: 1 },
  ];
  puts = [];
  inFlight = 0;
  maxInFlight = 0;
  deletes = [];
  push.mockReset();
  installFetch();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("장 저장은 한 번에 하나", () => {
  it("저장이 도는 동안 쓴 글을 '저장됨'으로 덮지 않고, 장을 바꿀 때 보낸다 (P0-2)", async () => {
    renderPage();
    await typeBody("v1");
    await passDebounce();
    await waitFor(() => expect(bodyPuts()).toHaveLength(1));

    // 첫 저장이 도는 동안 더 씁니다.
    await typeBody("v2");
    await act(async () => bodyPuts()[0].respond(true));
    await settle();

    expect(screen.queryByText("저장됨")).toBeNull();

    // 다른 장을 누르면 v2를 먼저 보내야 합니다.
    fireEvent.click(screen.getByText("2장"));
    await waitFor(() => expect(bodyPuts()).toHaveLength(2));
    expect(bodyPuts()[1].body.content_html).toBe("v2");
    await act(async () => bodyPuts()[1].respond(true));
    await waitFor(() => expect(titleInput().value).toBe("2장"));
    expect(chapters.find((c) => c.id === "a")?.content_html).toBe("v2");
  });

  it("저장 요청을 겹쳐 보내지 않고, 끝난 뒤 마지막 값을 한 번 더 보낸다 (P0-3)", async () => {
    renderPage();
    await typeBody("v1");
    await passDebounce();
    await waitFor(() => expect(bodyPuts()).toHaveLength(1));

    await typeBody("v2");
    await passDebounce();
    await typeBody("v3");
    await passDebounce();
    // 첫 저장이 끝나기 전에는 아무것도 더 보내지 않습니다.
    expect(maxInFlight).toBe(1);
    expect(bodyPuts()).toHaveLength(1);

    await act(async () => bodyPuts()[0].respond(true));
    await waitFor(() => expect(bodyPuts()).toHaveLength(2));
    // 중간 값(v2)은 건너뛰고 마지막 값만.
    expect(bodyPuts()[1].body.content_html).toBe("v3");
    await act(async () => bodyPuts()[1].respond(true));
    await waitFor(() => expect(screen.getByText("저장됨")).toBeInTheDocument());
    expect(maxInFlight).toBe(1);
    expect(chapters.find((c) => c.id === "a")?.content_html).toBe("v3");
  });

  it("[다시 시도]를 저장이 도는 중에 눌러도 겹치지 않는다 (P0-3)", async () => {
    renderPage();
    await typeBody("v1");
    await passDebounce();
    await waitFor(() => expect(bodyPuts()).toHaveLength(1));
    await act(async () => bodyPuts()[0].respond(false));
    const retry = await screen.findByText("다시 시도");

    await typeBody("v2");
    fireEvent.click(retry);
    await waitFor(() => expect(bodyPuts()).toHaveLength(2));
    // 다시 시도한 저장이 도는 중에 더 쓰고 디바운스가 지나도 겹치지 않습니다.
    await typeBody("v3");
    await passDebounce();
    expect(openPuts()).toHaveLength(1);
    expect(maxInFlight).toBe(1);
    await act(async () => bodyPuts()[1].respond(true));
    await waitFor(() => expect(bodyPuts()).toHaveLength(3));
    expect(bodyPuts()[2].body.content_html).toBe("v3");
  });
});

describe("결과는 자기 장에만", () => {
  it("장을 바꾸는 사이 이전 장의 저장이 실패하면 그 장에 머물고 실패를 보여 준다 (P1-9)", async () => {
    renderPage();
    await typeBody("v1");
    await passDebounce();
    await waitFor(() => expect(bodyPuts()).toHaveLength(1));

    // 저장이 도는 중에 2장을 누릅니다. 겹친 요청이 생기면 바로 성공시킵니다.
    fireEvent.click(screen.getByText("2장"));
    await settle();
    for (const extra of openPuts().slice(1)) await act(async () => extra.respond(true));
    await act(async () => bodyPuts()[0].respond(false));
    await settle();

    await waitFor(() => expect(screen.getByText("저장 안 됨")).toBeInTheDocument());
    // 실패는 1장의 것이므로 화면은 1장에 남아야 합니다.
    expect(titleInput().value).toBe("1장");
    expect(maxInFlight).toBe(1);
  });
});

describe("장 삭제", () => {
  it("입력 직후 지운 장에 저장을 보내지 않고, 다음 장을 연다 (P1-6·P1-7)", async () => {
    renderPage();
    await typeBody("v1");
    const row = (await screen.findByText("1장")).closest("div") as HTMLElement;
    fireEvent.click(row.querySelector("button") as HTMLButtonElement);
    await waitFor(() => expect(deletes).toEqual(["a"]));

    await passDebounce();
    await passDebounce();
    expect(puts.filter((p) => p.chapterId === "a")).toHaveLength(0);
    await waitFor(() => expect(titleInput().value).toBe("2장"));
    expect(screen.queryByText("저장 안 됨")).toBeNull();
    expect(screen.getByText("저장됨")).toBeInTheDocument();
  });
});

describe("장 공개 전환", () => {
  it("본문 저장을 먼저 끝내고, 실패하면 전환하지 않는다 (P1-8)", async () => {
    renderPage();
    await typeBody("v1");
    fireEvent.click(screen.getByText("이 장 공개하기"));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body.content_html).toBe("v1");
    await act(async () => puts[0].respond(false));
    await settle();
    await waitFor(() => expect(screen.getByText("저장 안 됨")).toBeInTheDocument());
    expect(puts.filter((p) => "status" in p.body)).toHaveLength(0);
  });

  it("저장이 끝난 뒤에 상태를 보낸다 (P1-8)", async () => {
    renderPage();
    await typeBody("v1");
    fireEvent.click(screen.getByText("이 장 공개하기"));
    await waitFor(() => expect(puts).toHaveLength(1));
    await act(async () => puts[0].respond(true));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1].body).toEqual({ status: "published" });
  });
});

describe("나갈 때", () => {
  it("저장 안 된 입력이 있으면 창 닫기를 막는다 (P1-11)", async () => {
    renderPage();
    await typeBody("v1");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("저장이 끝나면 창 닫기를 막지 않는다", async () => {
    renderPage();
    await typeBody("v1");
    await passDebounce();
    await waitFor(() => expect(bodyPuts()).toHaveLength(1));
    await act(async () => bodyPuts()[0].respond(true));
    await waitFor(() => expect(screen.getByText("저장됨")).toBeInTheDocument());
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("'스튜디오'는 저장을 끝낸 뒤 이동하고, 실패하면 머문다 (P1-11)", async () => {
    renderPage();
    await typeBody("v1");
    fireEvent.click(screen.getByText("스튜디오"));
    await waitFor(() => expect(bodyPuts()).toHaveLength(1));
    expect(push).not.toHaveBeenCalled();
    await act(async () => bodyPuts()[0].respond(false));
    await settle();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("스튜디오"));
    await waitFor(() => expect(bodyPuts()).toHaveLength(2));
    await act(async () => bodyPuts()[1].respond(true));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/creator"));
  });
});
