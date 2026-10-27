import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChapterSaveQueue,
  type ChapterDraft,
  type ChapterSaveResult,
} from "./chapter-save-queue";

/** 저장 요청을 붙잡아 두고 테스트가 고른 순서로 끝내는 가짜 서버. */
function heldServer() {
  const calls: {
    chapterId: string;
    draft: ChapterDraft;
    finish: (result: ChapterSaveResult) => Promise<void>;
  }[] = [];
  let open = 0;
  let maxOpen = 0;
  const save = vi.fn(
    (chapterId: string, draft: ChapterDraft) =>
      new Promise<ChapterSaveResult>((resolve) => {
        open += 1;
        maxOpen = Math.max(maxOpen, open);
        calls.push({
          chapterId,
          draft,
          finish: async (result) => {
            open -= 1;
            resolve(result);
            // 저장 줄의 then 사슬이 다 돌 때까지.
            for (let i = 0; i < 10; i += 1) await Promise.resolve();
          },
        });
      }),
  );
  return { save, calls, maxOpen: () => maxOpen };
}

const OK: ChapterSaveResult = { ok: true };
const FAIL: ChapterSaveResult = { ok: false, message: "저장하지 못했어요." };
const draft = (contentHtml: string): ChapterDraft => ({ title: "제목", contentHtml });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ChapterSaveQueue", () => {
  it("느린 저장이 도는 동안 들어온 입력은 끝난 뒤 마지막 값 하나로 보낸다", async () => {
    const server = heldServer();
    const queue = new ChapterSaveQueue(server.save);

    queue.edit("a", draft("v1"), 3000);
    vi.advanceTimersByTime(3000);
    expect(server.calls).toHaveLength(1);

    queue.edit("a", draft("v2"), 3000);
    vi.advanceTimersByTime(3000);
    queue.edit("a", draft("v3"), 3000);
    vi.advanceTimersByTime(3000);
    expect(server.calls).toHaveLength(1);
    expect(queue.status("a")).toMatchObject({ dirty: true, saving: true });

    await server.calls[0].finish(OK);
    // 첫 저장은 성공했지만 그 뒤 입력이 있으므로 아직 저장됨이 아닙니다.
    expect(queue.status("a").dirty).toBe(true);
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].draft.contentHtml).toBe("v3");

    await server.calls[1].finish(OK);
    expect(queue.status("a")).toEqual({ dirty: false, saving: false, failure: null });
    expect(server.calls).toHaveLength(2);
    expect(server.maxOpen()).toBe(1);
  });

  it("flush는 대기 타이머와 도는 저장을 둘 다 기다린다", async () => {
    const server = heldServer();
    const queue = new ChapterSaveQueue(server.save);

    queue.edit("a", draft("v1"), 3000);
    vi.advanceTimersByTime(3000);
    queue.edit("a", draft("v2"), 3000);

    let result: boolean | undefined;
    void queue.flush("a").then((ok) => {
      result = ok;
    });
    await server.calls[0].finish(OK);
    expect(result).toBeUndefined();
    expect(server.calls[1].draft.contentHtml).toBe("v2");
    await server.calls[1].finish(OK);
    expect(result).toBe(true);
    // 타이머는 지웠으므로 더 보내지 않습니다.
    vi.advanceTimersByTime(5000);
    expect(server.calls).toHaveLength(2);
  });

  it("실패하면 저절로 다시 보내지 않고, 같은 값을 기다리던 flush도 false", async () => {
    const server = heldServer();
    const queue = new ChapterSaveQueue(server.save);

    queue.edit("a", draft("v1"), 3000);
    vi.advanceTimersByTime(3000);
    const waiting = queue.flush("a");
    await server.calls[0].finish(FAIL);
    await expect(waiting).resolves.toBe(false);
    expect(server.calls).toHaveLength(1);
    expect(queue.status("a")).toMatchObject({ dirty: true, failure: "저장하지 못했어요." });
    expect(queue.hasUnsaved()).toBe(true);

    // [다시 시도]
    const retry = queue.flush("a");
    expect(server.calls).toHaveLength(2);
    await server.calls[1].finish(OK);
    await expect(retry).resolves.toBe(true);
    expect(queue.status("a").failure).toBeNull();
    expect(queue.hasUnsaved()).toBe(false);
  });

  it("실패한 저장이 도는 사이 들어온 입력은 그 입력의 타이머가 보낸다", async () => {
    const server = heldServer();
    const queue = new ChapterSaveQueue(server.save);

    queue.edit("a", draft("v1"), 3000);
    vi.advanceTimersByTime(3000);
    queue.edit("a", draft("v2"), 3000);
    vi.advanceTimersByTime(3000);
    await server.calls[0].finish(FAIL);
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].draft.contentHtml).toBe("v2");
    await server.calls[1].finish(OK);
    expect(queue.status("a")).toEqual({ dirty: false, saving: false, failure: null });
  });

  it("결과는 자기 장에만 붙는다", async () => {
    const server = heldServer();
    const queue = new ChapterSaveQueue(server.save);

    queue.edit("a", draft("a1"), 3000);
    queue.edit("b", draft("b1"), 3000);
    vi.advanceTimersByTime(3000);
    expect(server.calls.map((c) => c.chapterId)).toEqual(["a", "b"]);

    // 순서를 뒤집어 끝냅니다.
    await server.calls[1].finish(OK);
    expect(queue.status("b").dirty).toBe(false);
    expect(queue.status("a").dirty).toBe(true);
    await server.calls[0].finish(FAIL);
    expect(queue.status("a").failure).toBe("저장하지 못했어요.");
    expect(queue.status("b").failure).toBeNull();
  });

  it("지운 장은 타이머를 버리고, 도는 저장의 결과도 무시한다", async () => {
    const server = heldServer();
    const queue = new ChapterSaveQueue(server.save);
    const saved = vi.fn();
    queue.onSaved(saved);

    queue.edit("a", draft("v1"), 3000);
    vi.advanceTimersByTime(3000);
    queue.edit("a", draft("v2"), 3000);
    queue.discard("a");
    vi.advanceTimersByTime(5000);
    await server.calls[0].finish(FAIL);
    expect(server.calls).toHaveLength(1);
    expect(queue.status("a")).toEqual({ dirty: false, saving: false, failure: null });
    expect(queue.hasUnsaved()).toBe(false);
    expect(saved).not.toHaveBeenCalled();
  });

  it("hold는 도는 저장을 기다리고 새 저장을 걸지 않으며, release는 남은 입력을 보낸다", async () => {
    const server = heldServer();
    const queue = new ChapterSaveQueue(server.save);

    queue.edit("a", draft("v1"), 3000);
    vi.advanceTimersByTime(3000);
    let held = false;
    void queue.hold("a").then(() => {
      held = true;
    });
    queue.edit("a", draft("v2"), 3000);
    vi.advanceTimersByTime(5000);
    expect(held).toBe(false);
    await server.calls[0].finish(OK);
    expect(held).toBe(true);
    expect(server.calls).toHaveLength(1);

    // 삭제가 실패하면 남은 입력을 보냅니다.
    queue.release("a");
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1].draft.contentHtml).toBe("v2");
  });

  it("저장이 던져도 실패로 다룬다", async () => {
    const queue = new ChapterSaveQueue(() => Promise.reject(new Error("network")));
    queue.edit("a", draft("v1"), 3000);
    await expect(queue.flush("a")).resolves.toBe(false);
    expect(queue.status("a").failure).toMatch(/저장하지 못했어요/);
  });
});
