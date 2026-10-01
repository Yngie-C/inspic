"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  readResponseCache,
  writeResponseCache,
  type BlockAnswers,
  type BookAnswers,
} from "@/lib/workbook/response-cache";
import {
  httpResponseClient,
  type WorkbookResponseClient,
} from "@/lib/workbook/response-client";
import type { ResponseWrite } from "@/lib/workbook/response-payload";
import { groupAnswersByBlock, responseKey } from "@/lib/workbook/responses";
import type { WorkbookAnswer } from "@/lib/workbook/types";

/**
 * 책 한 권을 읽는 동안의 독자 응답을 들고 있는 곳.
 *
 * 블록마다 따로 불러오지 않고 책 단위로 한 번 불러옵니다. 챕터를 넘길
 * 때마다 왕복이 생기면 워크북이 있는 책일수록 느려지고, 응답의 정체성에는
 * 챕터가 들어가지 않으므로 나눌 이유도 없습니다.
 *
 * 저장은 낙관적입니다. 화면은 즉시 바뀌고, 실제 저장은 디바운스된 배치로
 * 나갑니다. 실패해도 값은 화면과 캐시에 남아 있고 다음 입력 때 다시
 * 시도합니다 — 독자가 방금 쓴 문장을 잃는 것이 이 화면에서 가장 나쁜
 * 일입니다.
 */

export type SaveState =
  /** 서버에서 기존 응답을 불러오는 중. */
  | "loading"
  /** 불러왔고 아직 쓴 것이 없음. */
  | "idle"
  | "saving"
  | "saved"
  /** 저장 실패. 값은 화면과 캐시에 남아 있습니다. */
  | "error"
  /** 저장할 수 없는 상태(비로그인·미구매). 이 기기에만 남습니다. */
  | "local-only";

/**
 * 블록 하나의 저장 진행. 책 전체 상태(`SaveState`)와 별개로, 블록 머리 줄에
 * "저장됨 · 방금"을 쓰기 위해 둡니다.
 */
export interface BlockSave {
  /** 이 블록에 아직 서버로 못 보낸 응답이 있다. */
  pending: boolean;
  /** 이번 세션에서 마지막으로 저장에 성공한 시각(ms). */
  savedAt: number | null;
}

interface WorkbookResponsesValue {
  answers: BookAnswers;
  blockSaves: Record<string, BlockSave>;
  setAnswer(blockId: string, fieldKey: string, value: WorkbookAnswer): void;
  saveState: SaveState;
  /** 저장 실패 시 사람이 읽을 수 있는 이유. */
  saveError: string | null;
  /** 실패한 배치를 다시 보냅니다. */
  retry(): void;
}

const WorkbookResponsesContext = createContext<WorkbookResponsesValue | null>(
  null,
);

/** 응답을 모아 보내기 전에 기다리는 시간. 타이핑 한 글자마다 왕복하지 않기 위한 것. */
const DEBOUNCE_MS = 600;

const NO_ANSWERS: BlockAnswers = {};
const NO_SAVE: BlockSave = { pending: false, savedAt: null };

interface Props {
  bookId: string;
  /**
   * 서버에 저장할 수 있는 상태인가 (로그인했고 이 책에 접근 권한이 있는가).
   *
   * false면 캐시에만 씁니다. 저장할 수 없는데 저장된 척하지 않으려고
   * 상태를 분리했습니다.
   */
  canSave: boolean;
  /**
   * 지금 보고 있는 사람. 비로그인이면 null.
   *
   * 오프라인 캐시의 칸을 나누는 데 씁니다. 한 기기에서 익명으로 읽다가
   * 로그인하는 경로가 정상이므로, 나누지 않으면 익명일 때 쓴 답이
   * 로그인 화면에 저장된 것처럼 떠오릅니다.
   */
  viewerId: string | null;
  client?: WorkbookResponseClient;
  /** 배치를 모으는 시간. 테스트에서 0으로 줄입니다. */
  debounceMs?: number;
  children: ReactNode;
}

export function WorkbookResponsesProvider({
  bookId,
  canSave,
  viewerId,
  client = httpResponseClient,
  debounceMs = DEBOUNCE_MS,
  children,
}: Props) {
  const [answers, setAnswers] = useState<BookAnswers>({});
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [blockSaves, setBlockSaves] = useState<Record<string, BlockSave>>({});

  // 화면 상태의 거울. setAnswer가 이전 값을 읽어야 하는데, setState updater
  // 안에서 캐시 쓰기 같은 부수효과를 하면 StrictMode의 이중 호출에서
  // 두 번 실행됩니다.
  const answersRef = useRef<BookAnswers>({});
  // 아직 서버에 못 보낸 응답. 키는 responseKey(block_id, field_key).
  const pendingRef = useRef(new Map<string, ResponseWrite>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(next: BookAnswers) {
    answersRef.current = next;
    setAnswers(next);
    writeResponseCache(bookId, viewerId, next);
  }

  // 최초 로드: 캐시를 먼저 그리고, 서버 값이 오면 그쪽으로 덮습니다.
  // 다른 기기에서 쓴 최신 응답이 이 기기의 옛 캐시에 지워지면 안 됩니다.
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const cached = readResponseCache(bookId, viewerId);
      // canSave가 false여도 await를 거칩니다. 이펙트 본문에서 곧바로
      // setState 하면 첫 렌더가 서버 렌더와 어긋납니다.
      const loaded = await loadOrNull(canSave ? client : null, bookId);
      if (cancelled) return;

      if (loaded === null) {
        answersRef.current = cached;
        setAnswers(cached);
        setSaveState(canSave ? "error" : "local-only");
        setSaveError(
          canSave ? "저장된 답을 불러오지 못했어요." : null,
        );
        return;
      }

      // 서버에 없는 블록의 캐시 값은 남깁니다 — 아직 못 보낸 응답입니다.
      const merged: BookAnswers = { ...cached };
      for (const [blockId, fields] of Object.entries(
        groupAnswersByBlock(loaded),
      )) {
        merged[blockId] = { ...cached[blockId], ...fields };
      }

      answersRef.current = merged;
      setAnswers(merged);
      writeResponseCache(bookId, viewerId, merged);
      setSaveState(pendingRef.current.size > 0 ? "saving" : "idle");
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [bookId, canSave, viewerId, client]);

  async function flush(options?: { keepalive?: boolean }) {
    if (!canSave) return;

    const batch = [...pendingRef.current.values()];
    if (batch.length === 0) return;

    setSaveState("saving");

    try {
      const result = await client.save(bookId, batch, options);

      // 보낸 사이에 또 고쳤으면 큐에 남겨 둡니다. 무조건 지우면 마지막
      // 타이핑이 조용히 사라집니다.
      for (const write of batch) {
        const key = responseKey(write.block_id, write.field_key);
        if (pendingRef.current.get(key)?.value === write.value) {
          pendingRef.current.delete(key);
        }
      }

      // 보낸 블록 중 큐에서 완전히 빠진 것만 저장됨으로 올립니다.
      // 서버가 거절한 블록도 저장된 것이 아니므로 올리지 않습니다.
      const stillPending = new Set([
        ...[...pendingRef.current.values()].map((write) => write.block_id),
        ...result.rejected.map((write) => write.block_id),
      ]);
      const savedAt = Date.now();
      setBlockSaves((previous) => {
        const next = { ...previous };
        for (const write of batch) {
          if (stillPending.has(write.block_id)) continue;
          next[write.block_id] = { pending: false, savedAt };
        }
        return next;
      });

      if (result.rejected.length > 0) {
        setSaveState("error");
        setSaveError(
          "일부 항목을 저장하지 못했어요. 저자가 이 부분을 수정 중일 수 있어요.",
        );
        return;
      }

      setSaveError(null);
      setSaveState(pendingRef.current.size > 0 ? "saving" : "saved");
    } catch {
      setSaveState("error");
      setSaveError("저장하지 못했어요. 연결을 확인해 주세요.");
    }
  }

  function schedule() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, debounceMs);
  }

  function setAnswer(
    blockId: string,
    fieldKey: string,
    value: WorkbookAnswer,
  ) {
    const previous = answersRef.current;
    commit({
      ...previous,
      [blockId]: { ...previous[blockId], [fieldKey]: value },
    });

    if (!canSave) {
      setSaveState("local-only");
      return;
    }

    setBlockSaves((previous) => ({
      ...previous,
      [blockId]: { pending: true, savedAt: previous[blockId]?.savedAt ?? null },
    }));
    pendingRef.current.set(responseKey(blockId, fieldKey), {
      block_id: blockId,
      field_key: fieldKey,
      value,
    });
    schedule();
  }

  // 탭을 닫거나 다른 앱으로 넘어갈 때 남은 배치를 밀어 넣습니다.
  // 디바운스 600ms 안에 화면을 떠나면 그 사이 입력이 사라집니다.
  useEffect(() => {
    function flushNow() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void flush({ keepalive: true });
    }

    window.addEventListener("pagehide", flushNow);
    return () => {
      window.removeEventListener("pagehide", flushNow);
      flushNow();
    };
    // flush는 매 렌더 새로 만들어지지만 pendingRef/answersRef를 통해
    // 최신 상태를 읽으므로, 책이 바뀔 때만 다시 붙이면 됩니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, canSave, viewerId]);

  const value: WorkbookResponsesValue = {
    answers,
    blockSaves,
    setAnswer,
    saveState,
    saveError,
    retry: () => void flush(),
  };

  return (
    <WorkbookResponsesContext.Provider value={value}>
      {children}
    </WorkbookResponsesContext.Provider>
  );
}

async function loadOrNull(
  client: WorkbookResponseClient | null,
  bookId: string,
) {
  if (!client) return null;
  try {
    return await client.load(bookId);
  } catch {
    return null;
  }
}

/** 리더 전체의 저장 상태. 헤더의 표시에 씁니다. */
export function useWorkbookSaveStatus() {
  const context = useContext(WorkbookResponsesContext);
  if (!context) {
    throw new Error(
      "useWorkbookSaveStatus는 WorkbookResponsesProvider 안에서만 쓸 수 있습니다.",
    );
  }
  return {
    saveState: context.saveState,
    saveError: context.saveError,
    retry: context.retry,
  };
}

/**
 * 블록 하나의 응답을 읽고 씁니다.
 *
 * 응답은 field_key로만 찾습니다. 화면에 몇 번째로 그려지는지는 상관없고,
 * 크리에이터가 문항을 추가·삭제·이동해도 남은 응답은 제자리에 붙습니다.
 */
export function useBlockResponses(blockId: string) {
  const context = useContext(WorkbookResponsesContext);
  if (!context) {
    throw new Error(
      "워크북 블록은 WorkbookResponsesProvider 안에서만 그릴 수 있습니다. " +
        "provider 없이 그리면 응답이 저장되지 않은 채 저장된 것처럼 보입니다.",
    );
  }

  const { answers, setAnswer } = context;

  return {
    answers: answers[blockId] ?? NO_ANSWERS,
    save: context.blockSaves[blockId] ?? NO_SAVE,
    saveState: context.saveState,
    retry: context.retry,
    setAnswer: (fieldKey: string, value: WorkbookAnswer) =>
      setAnswer(blockId, fieldKey, value),
  };
}
