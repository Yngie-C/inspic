/**
 * 편집 화면의 장 저장 줄 (코드 리뷰 11-B).
 *
 * 규칙은 독자 응답 쪽(WP5, `WorkbookResponsesProvider`)과 같습니다.
 *
 * - **장마다 저장 요청은 한 번에 하나입니다.** 도는 동안 들어온 입력은
 *   "마지막 값"만 바꿔 두고, 끝나면 그 값이 보낸 값과 다를 때 한 번 더
 *   보냅니다. 겹쳐 보내면 늦게 끝난 옛 저장이 새 본문을 덮습니다(P0-3).
 * - **입력마다 순번을 올리고, 저장이 들고 간 순번이 지금 순번과 같을 때만
 *   저장된 것으로 봅니다.** 도는 동안 쓴 글을 "저장됨"으로 덮으면 장을
 *   바꾸거나 나갈 때 그 글을 건너뛰고 버립니다(P0-2).
 * - **결과는 자기 장에만 붙습니다.** 상태를 장 ID로 따로 들고 있어, 장을
 *   바꾼 뒤 끝난 이전 장의 결과가 지금 장의 표시를 바꾸지 않습니다(P1-9).
 *
 * React와 떼어 둔 것은 순서 문제를 화면 없이 시험하기 위해서입니다.
 */

export interface ChapterDraft {
  title: string;
  contentHtml: string;
}

export type ChapterSaveResult =
  | { ok: true; chapter?: unknown }
  | { ok: false; message: string };

export type SaveChapterFn = (
  chapterId: string,
  draft: ChapterDraft,
) => Promise<ChapterSaveResult>;

export interface ChapterSaveStatus {
  /** 마지막 입력이 아직 저장되지 않았습니다(대기·진행 중·실패 모두). */
  dirty: boolean;
  /** 저장 요청이 도는 중입니다. */
  saving: boolean;
  /** 마지막 저장의 실패 문구. 다음 저장이 성공하면 지웁니다. */
  failure: string | null;
}

export const CLEAN_STATUS: ChapterSaveStatus = Object.freeze({
  dirty: false,
  saving: false,
  failure: null,
});

interface ChapterSlot {
  latest: ChapterDraft;
  /** 입력 순번. edit()마다 하나씩 오릅니다. */
  seq: number;
  /** 서버가 받았다고 확인한 마지막 순번. */
  savedSeq: number;
  failure: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  running: Promise<boolean> | null;
  /** 마지막으로 실패한 저장이 들고 간 순번. */
  failedSeq: number | null;
  /** 삭제를 기다리는 중입니다. 타이머를 걸지도, 보내지도 않습니다. */
  held: boolean;
  /** 버렸습니다(장 삭제). 도는 중이던 저장의 결과는 무시합니다. */
  discarded: boolean;
}

type SavedListener = (chapterId: string, result: { chapter?: unknown }) => void;

export class ChapterSaveQueue {
  private slots = new Map<string, ChapterSlot>();
  private listeners = new Set<() => void>();
  private savedListeners = new Set<SavedListener>();
  private snapshot: ReadonlyMap<string, ChapterSaveStatus> = new Map();

  constructor(private readonly save: SaveChapterFn) {}

  // --- 구독 (useSyncExternalStore) ---

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ReadonlyMap<string, ChapterSaveStatus> => this.snapshot;

  /** 저장이 성공할 때마다 부릅니다(캐시 갱신용). */
  onSaved(listener: SavedListener): () => void {
    this.savedListeners.add(listener);
    return () => {
      this.savedListeners.delete(listener);
    };
  }

  status(chapterId: string): ChapterSaveStatus {
    return this.snapshot.get(chapterId) ?? CLEAN_STATUS;
  }

  /** 어느 장이든 저장되지 않은 입력이나 실패가 남아 있습니다. */
  hasUnsaved(): boolean {
    for (const status of this.snapshot.values()) {
      if (status.dirty || status.failure) return true;
    }
    return false;
  }

  // --- 입력과 저장 ---

  /**
   * 입력을 받아 `delayMs` 뒤 저장을 겁니다. 도는 저장이 있으면 그것이
   * 끝난 뒤 마지막 값을 보냅니다.
   */
  edit(chapterId: string, draft: ChapterDraft, delayMs: number): void {
    const slot = this.slot(chapterId);
    slot.latest = draft;
    slot.seq += 1;
    this.clearTimer(slot);
    if (!slot.held) {
      slot.timer = setTimeout(() => {
        slot.timer = null;
        void this.flush(chapterId);
      }, delayMs);
    }
    this.emit();
  }

  /**
   * 대기 타이머를 지우고 마지막 값을 지금 보냅니다. 도는 저장이 있으면
   * 그것이 끝난 뒤 이어 보냅니다. 마지막 입력까지 저장됐으면 true.
   */
  flush(chapterId: string): Promise<boolean> {
    const slot = this.slots.get(chapterId);
    if (!slot) return Promise.resolve(true);
    this.clearTimer(slot);
    if (slot.held) return Promise.resolve(slot.savedSeq === slot.seq);
    if (slot.running) {
      // 도는 저장이 끝난 뒤 다시 봅니다. 그 저장이 마지막 값을 들고 가서
      // 실패했으면 같은 값을 곧바로 다시 보내지 않습니다([다시 시도]는
      // 저장이 돌지 않을 때 누르므로 아래로 바로 갑니다).
      return slot.running.then((ok) => {
        if (slot.discarded) return false;
        if (!ok && slot.failedSeq === slot.seq) return false;
        return this.flush(chapterId);
      });
    }
    if (slot.savedSeq === slot.seq) return Promise.resolve(true);
    const run = this.drain(chapterId, slot).finally(() => {
      slot.running = null;
      if (!slot.discarded) this.emit();
    });
    slot.running = run;
    this.emit();
    return run;
  }

  /** 모든 장의 대기 중인 저장을 보냅니다. 전부 저장됐으면 true. */
  async flushAll(): Promise<boolean> {
    const results = await Promise.all(
      [...this.slots.keys()].map((chapterId) => this.flush(chapterId)),
    );
    return results.every(Boolean);
  }

  /**
   * 장을 지우기 전에 부릅니다. 타이머를 지우고 새 저장을 걸지 않게 한 뒤,
   * 도는 저장이 있으면 끝나기를 기다립니다(지우는 요청과 겹치지 않게).
   */
  async hold(chapterId: string): Promise<void> {
    const slot = this.slots.get(chapterId);
    if (!slot) return;
    slot.held = true;
    this.clearTimer(slot);
    if (slot.running) await slot.running.catch(() => false);
  }

  /** 삭제가 실패했을 때 — 남은 입력이 있으면 다시 저장합니다. */
  release(chapterId: string): void {
    const slot = this.slots.get(chapterId);
    if (!slot) return;
    slot.held = false;
    if (slot.savedSeq !== slot.seq) void this.flush(chapterId);
  }

  /** 지운 장의 타이머·대기 값·실패를 버립니다(P1-6). */
  discard(chapterId: string): void {
    const slot = this.slots.get(chapterId);
    if (!slot) return;
    slot.discarded = true;
    this.clearTimer(slot);
    this.slots.delete(chapterId);
    this.emit();
  }

  // --- 내부 ---

  private async drain(chapterId: string, slot: ChapterSlot): Promise<boolean> {
    for (;;) {
      if (slot.savedSeq === slot.seq) return true;
      // 지우려고 붙잡은 장에는 더 보내지 않습니다(남은 입력은 release가).
      if (slot.held) return false;
      const seq = slot.seq;
      const draft = slot.latest;
      let result: ChapterSaveResult;
      try {
        result = await this.save(chapterId, draft);
      } catch {
        result = { ok: false, message: GENERIC_SAVE_FAILURE };
      }
      if (slot.discarded) return false;
      if (!result.ok) {
        // 저절로 다시 보내지 않습니다. 도는 사이 들어온 입력은 그 입력의
        // 타이머가, 같은 값은 [다시 시도]가 다시 보냅니다.
        slot.failure = result.message;
        slot.failedSeq = seq;
        this.emit();
        return false;
      }
      // 도는 사이 입력이 더 들어왔으면 순번이 달라 아직 dirty입니다 —
      // 돌아가서 마지막 값을 한 번 더 보냅니다.
      slot.savedSeq = seq;
      slot.failure = null;
      slot.failedSeq = null;
      for (const listener of this.savedListeners) listener(chapterId, result);
      this.emit();
    }
  }

  private slot(chapterId: string): ChapterSlot {
    let slot = this.slots.get(chapterId);
    if (!slot) {
      slot = {
        latest: { title: "", contentHtml: "" },
        seq: 0,
        savedSeq: 0,
        failure: null,
        timer: null,
        running: null,
        failedSeq: null,
        held: false,
        discarded: false,
      };
      this.slots.set(chapterId, slot);
    }
    return slot;
  }

  private clearTimer(slot: ChapterSlot) {
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
  }

  private emit() {
    const next = new Map<string, ChapterSaveStatus>();
    for (const [chapterId, slot] of this.slots) {
      const status: ChapterSaveStatus = {
        dirty: slot.savedSeq !== slot.seq,
        saving: slot.running !== null,
        failure: slot.failure,
      };
      if (status.dirty || status.saving || status.failure) next.set(chapterId, status);
    }
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}

export const GENERIC_SAVE_FAILURE = "저장하지 못했어요. 연결을 확인한 뒤 다시 시도하세요.";

/**
 * 장 하나를 저장합니다. 제목을 지우고 다시 쓰는 사이에도 본문은 저장돼야
 * 하므로, 빈 제목은 보내지 않고 이전 제목을 그대로 둡니다(서버가 거절).
 * 서버 문구는 크리에이터가 풀 수 있는 거절일 때만 씁니다.
 */
export const saveChapterRequest: SaveChapterFn = async (chapterId, draft) => {
  try {
    const res = await fetch(`/api/chapters/${encodeURIComponent(chapterId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        draft.title.trim()
          ? { title: draft.title, content_html: draft.contentHtml }
          : { content_html: draft.contentHtml },
      ),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        message:
          (json.code === "CONTENT_TOO_LONG" || json.code === "VALIDATION_ERROR") &&
          typeof json.error === "string"
            ? json.error
            : GENERIC_SAVE_FAILURE,
      };
    }
    return { ok: true, chapter: json.data };
  } catch {
    return { ok: false, message: GENERIC_SAVE_FAILURE };
  }
};
