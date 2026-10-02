"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  emptyResponseCache,
  markedWrites,
  mergeLoadedResponses,
  readResponseCache,
  withMark,
  withoutMark,
  writeResponseCache,
  type BlockAnswers,
  type ResponseCache,
  type UnsentMarks,
} from "@/lib/workbook/response-cache";
import {
  KEEPALIVE_BODY_LIMIT,
  REQUEST_BODY_LIMIT,
  ResponseSaveRejectedError,
  chunkWrites,
  fitsKeepalive,
  httpResponseClient,
  type WorkbookResponseClient,
} from "@/lib/workbook/response-client";
import type { RejectedWrite, ResponseWrite } from "@/lib/workbook/response-payload";
import { responseKey } from "@/lib/workbook/responses";
import { isStorableBlockId, isStorableFieldKey } from "@/lib/template-node-id";
import type { WorkbookAnswer } from "@/lib/workbook/types";

/**
 * 책 한 권을 읽는 동안의 독자 응답을 들고 있는 곳.
 *
 * 블록마다 따로 불러오지 않고 책 단위로 한 번 불러옵니다. 챕터를 넘길
 * 때마다 왕복이 생기면 워크북이 있는 책일수록 느려지고, 응답의 정체성에는
 * 챕터가 들어가지 않으므로 나눌 이유도 없습니다.
 *
 * 저장은 낙관적입니다. 화면은 즉시 바뀌고, 실제 저장은 디바운스된 배치로
 * 나갑니다. 독자가 방금 쓴 문장을 잃는 것이 이 화면에서 가장 나쁜 일이라,
 * 지키는 규칙이 몇 가지 있습니다(코드 리뷰 3단계).
 *
 * - **서버가 받았다고 확인하기 전까지 답은 캐시에 "미전송"으로 남습니다.**
 *   새로고침·탭 닫기·구매 전 미리보기에서 쓴 답도 다음에 열 때 다시 갑니다.
 * - **저장 요청은 한 번에 하나입니다.** 둘이 겹치면 늦게 출발한 새 값이
 *   먼저 커밋되고 옛 값이 그 위를 덮습니다.
 * - **서버가 분명히 거절한 것(4xx, `rejected`)은 큐에서 뺍니다.** 남기면
 *   다음 저장마다 다시 실려 그 세션의 저장이 전부 막힙니다.
 * - **계정이 바뀌면 이전 사람의 큐를 보내지 않습니다.**
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
 * 블록이 저장되지 못한 이유.
 *
 * - `retry`: 연결·서버 오류, 또는 권한 확인 실패. 다시 보내면 될 수 있습니다.
 * - `rejected`: 서버가 받지 않음(문항 정의가 없거나 타입이 맞지 않음). 같은
 *   값을 다시 보내도 같은 답이 옵니다. 저자가 블록을 고치는 중일 수 있습니다.
 */
export type BlockFailure = "retry" | "rejected";

/**
 * 블록 하나의 저장 진행. 책 전체 상태(`SaveState`)와 별개로, 블록 머리 줄에
 * "저장됨 · 방금"을 쓰기 위해 둡니다. 실패도 블록 단위입니다 — 책 전체
 * 상태로 판정하면 실패한 적 없는 블록까지 "저장 안 됨"이 뜹니다.
 */
export interface BlockSave {
  /** 이 블록에 아직 서버로 못 보낸 응답이 있다. */
  pending: boolean;
  /** 이번 세션에서 마지막으로 저장에 성공한 시각(ms). */
  savedAt: number | null;
  failure: BlockFailure | null;
}

interface WorkbookResponsesValue {
  cache: ResponseCache;
  blockSaves: Record<string, BlockSave>;
  setAnswer(blockId: string, fieldKey: string, value: WorkbookAnswer): void;
  saveState: SaveState;
  /** 저장 실패 시 사람이 읽을 수 있는 이유. */
  saveError: string | null;
  /** 확인되지 않은 답을 다시 보냅니다. 불러오기가 실패했으면 다시 불러옵니다. */
  retry(): void;
}

const WorkbookResponsesContext = createContext<WorkbookResponsesValue | null>(
  null,
);

/** 응답을 모아 보내기 전에 기다리는 시간. 타이핑 한 글자마다 왕복하지 않기 위한 것. */
const DEBOUNCE_MS = 600;

const NO_ANSWERS: BlockAnswers = {};
const NO_SAVE: BlockSave = { pending: false, savedAt: null, failure: null };

const NETWORK_ERROR = "저장하지 못했어요. 연결을 확인해 주세요.";
const DENIED_ERROR =
  "로그인이 풀렸거나 이 책에 답을 저장할 권한이 없어요. 다시 로그인해 주세요. 쓰신 답은 이 기기에 남아 있어요.";
const REJECTED_ERROR =
  "일부 답을 저장하지 못했어요. 저자가 이 부분을 고치는 중일 수 있어요.";
const LOAD_ERROR = "저장된 답을 불러오지 못했어요.";

/** 지금 보고 있는 책·사람. 바뀌면 큐와 진행 중인 저장의 결과를 새 세션과 섞지 않습니다. */
interface Session {
  bookId: string;
  viewerId: string | null;
  canSave: boolean;
  generation: number;
}

interface Props {
  bookId: string;
  /**
   * 서버에 저장할 수 있는 상태인가 (로그인했고 이 책에 접근 권한이 있는가).
   *
   * false면 캐시에만 씁니다. 저장할 수 없는데 저장된 척하지 않으려고
   * 상태를 분리했습니다. 쓴 답은 미전송으로 남아, 같은 사람이 저장할 수
   * 있게 되면(구매) 다음에 열 때 갑니다.
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
  const [cache, setCache] = useState<ResponseCache>(emptyResponseCache);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [blockSaves, setBlockSaves] = useState<Record<string, BlockSave>>({});
  const [reloadToken, setReloadToken] = useState(0);

  // 화면 상태의 거울. setAnswer가 이전 값을 읽어야 하는데, setState updater
  // 안에서 캐시 쓰기 같은 부수효과를 하면 StrictMode의 이중 호출에서
  // 두 번 실행됩니다.
  const cacheRef = useRef<ResponseCache>(emptyResponseCache());
  // 이번 세션에서 아직 서버에 못 보낸 응답. 키는 responseKey(block_id, field_key).
  const pendingRef = useRef(new Map<string, ResponseWrite>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const flushSeqRef = useRef(0);
  const rerunRef = useRef(false);
  // 진행 중에 페이지를 떠나면, 이어서 보내는 요청은 keepalive로 나가야 합니다.
  const rerunKeepaliveRef = useRef(false);
  const loadFailedRef = useRef(false);
  // 서버 값을 불러와 합치기 전에는 보내지 않습니다. 로딩 중에 쓴 답이 먼저
  // 저장되면 미전송 표시가 지워지고, 그 뒤 도착한 (저장 전에 읽은) 서버
  // 값이 방금 쓴 답을 화면에서 덮습니다. 큐는 합친 뒤 한꺼번에 나갑니다.
  const hydratedRef = useRef(false);
  // 이번 세션에서 거절된 답. 남아 있는 동안은 다른 블록이 저장돼도 책
  // 전체를 "저장됨"으로 올리지 않습니다.
  const sessionRejectedRef = useRef(new Set<string>());
  const sessionRef = useRef<Session>({
    bookId,
    viewerId,
    canSave,
    generation: 0,
  });

  // 최신 props. 이펙트 정리 시점에 "언마운트인가, 사람이 바뀐 것인가"를
  // 가르고, 디바운스 타이머가 옛 렌더의 값을 쥐지 않게 합니다.
  const latestRef = useRef({ bookId, viewerId, client, debounceMs });
  useLayoutEffect(() => {
    latestRef.current = { bookId, viewerId, client, debounceMs };
  });

  const isCurrent = useCallback(
    (session: Session) =>
      sessionRef.current.generation === session.generation,
    [],
  );

  const commit = useCallback((next: ResponseCache) => {
    const session = sessionRef.current;
    cacheRef.current = next;
    setCache(next);
    writeResponseCache(session.bookId, session.viewerId, next);
  }, []);

  /** 보낸 묶음의 결과를 반영합니다. 서버가 받은 답은 미전송 표시를 지웁니다. */
  const settle = useCallback(
    (session: Session, chunk: readonly ResponseWrite[], rejected: readonly RejectedWrite[]) => {
      const rejectedKeys = new Set(
        rejected.map((write) => responseKey(write.block_id, write.field_key)),
      );

      if (!isCurrent(session)) {
        // 세션이 바뀐 뒤 도착한 결과. 화면은 건드리지 않고 그 사람의 캐시
        // 칸만 맞춥니다 — 안 맞추면 다음에 열 때 같은 답을 또 보냅니다.
        const stale = readResponseCache(session.bookId, session.viewerId);
        writeResponseCache(
          session.bookId,
          session.viewerId,
          applySettled(stale, chunk, rejectedKeys),
        );
        return;
      }

      for (const write of chunk) {
        const key = responseKey(write.block_id, write.field_key);
        // 보낸 사이에 또 고쳤으면 큐에 남겨 둡니다. 무조건 지우면 마지막
        // 타이핑이 조용히 사라집니다.
        if (pendingRef.current.get(key)?.value === write.value) {
          pendingRef.current.delete(key);
        }
        if (rejectedKeys.has(key)) sessionRejectedRef.current.add(key);
        else sessionRejectedRef.current.delete(key);
      }
      commit(applySettled(cacheRef.current, chunk, rejectedKeys));

      const stillPending = new Set(
        [...pendingRef.current.values()].map((write) => write.block_id),
      );
      const rejectedBlocks = new Set(rejected.map((write) => write.block_id));
      const savedAt = Date.now();
      setBlockSaves((previous) => {
        const next = { ...previous };
        for (const blockId of new Set(chunk.map((write) => write.block_id))) {
          const before = previous[blockId] ?? NO_SAVE;
          if (rejectedBlocks.has(blockId)) {
            next[blockId] = {
              pending: stillPending.has(blockId),
              savedAt: before.savedAt,
              failure: "rejected",
            };
          } else if (stillPending.has(blockId)) {
            next[blockId] = { ...before, pending: true, failure: null };
          } else {
            next[blockId] = { pending: false, savedAt, failure: null };
          }
        }
        return next;
      });
    },
    [commit, isCurrent],
  );

  const markBlocks = useCallback(
    (chunk: readonly ResponseWrite[], pending: boolean) => {
      setBlockSaves((previous) => {
        const next = { ...previous };
        for (const blockId of new Set(chunk.map((write) => write.block_id))) {
          next[blockId] = {
            pending,
            savedAt: previous[blockId]?.savedAt ?? null,
            failure: "retry",
          };
        }
        return next;
      });
    },
    [],
  );

  const sendPending = useCallback(
    async (session: Session, keepalive: boolean) => {
      const batch = [...pendingRef.current.values()];
      if (batch.length === 0) return;

      if (isCurrent(session)) setSaveState("saving");

      let networkFailed = false;
      let denied = false;

      // 한 요청에 담을 수 있는 수와 크기가 정해져 있습니다(200건, keepalive는
      // 64KB). 넘기면 서버가 통째로 거절하거나 브라우저가 보내지 않습니다.
      const limit = keepalive ? KEEPALIVE_BODY_LIMIT : REQUEST_BODY_LIMIT;
      for (const chunk of chunkWrites(batch, limit)) {
        try {
          const result = await latestRef.current.client.save(
            session.bookId,
            chunk,
            // 한 건이 keepalive 한도보다 크면 일반 요청으로 보냅니다. 페이지가
            // 닫히면 끊길 수 있지만, 그래도 캐시에 미전송으로 남습니다.
            { keepalive: keepalive && fitsKeepalive(chunk) },
          );
          settle(session, chunk, result.rejected);
        } catch (error) {
          if (!(error instanceof ResponseSaveRejectedError)) {
            // 연결·서버 오류. 큐에 그대로 두고 나머지 묶음도 보내지 않습니다
            // (보내 봐야 같은 이유로 실패합니다). 보내지 못한 뒤 묶음의 블록도
            // 실패로 표시합니다 — 안 그러면 "저장 중"에 머뭅니다.
            if (isCurrent(session)) {
              markBlocks([...pendingRef.current.values()], true);
            }
            networkFailed = true;
            break;
          }

          if (error.status === 401 || error.status === 403) {
            // 로그인이 풀렸거나 권한이 없어졌습니다. 이 세션에서는 다시 보내도
            // 같으므로 큐에서 빼고, 답은 캐시에 미전송으로 남깁니다.
            if (isCurrent(session)) {
              for (const write of chunk) {
                const key = responseKey(write.block_id, write.field_key);
                if (pendingRef.current.get(key)?.value === write.value) {
                  pendingRef.current.delete(key);
                }
              }
              markBlocks(chunk, false);
            }
            denied = true;
            continue;
          }

          // 그 밖의 4xx: 본문을 서버가 받지 않음. 같은 묶음을 다시 보내면
          // 같은 결과라 거절로 처리합니다.
          settle(
            session,
            chunk,
            chunk.map((write) => ({
              block_id: write.block_id,
              field_key: write.field_key,
              reason: "invalid_value" as const,
            })),
          );
        }
      }

      if (!isCurrent(session)) return;

      if (networkFailed) {
        setSaveState("error");
        setSaveError(NETWORK_ERROR);
      } else if (denied) {
        setSaveState("error");
        setSaveError(DENIED_ERROR);
      } else if (sessionRejectedRef.current.size > 0) {
        setSaveState("error");
        setSaveError(REJECTED_ERROR);
      } else {
        setSaveError(null);
        setSaveState(pendingRef.current.size > 0 ? "saving" : "saved");
      }
    },
    [isCurrent, markBlocks, settle],
  );

  /**
   * 큐를 보냅니다. 한 번에 하나만 나갑니다.
   *
   * 진행 중에 또 부르면 끝난 뒤 한 번 더 돕니다. 겹쳐 보내면 늦게 출발한 새
   * 값이 먼저 커밋되고 옛 요청이 그 위를 덮어, 화면은 "abc · 저장됨"인데
   * DB는 "ab"가 됩니다(코드 리뷰 3-P0-3).
   */
  const flush = useCallback(
    (options?: { keepalive?: boolean }): Promise<void> => {
      const session = sessionRef.current;
      if (!session.canSave || !hydratedRef.current) return Promise.resolve();

      if (inFlightRef.current) {
        rerunRef.current = true;
        return inFlightRef.current;
      }

      const seq = ++flushSeqRef.current;
      const run = (async () => {
        try {
          let keepalive = options?.keepalive ?? false;
          do {
            rerunRef.current = false;
            keepalive = keepalive || rerunKeepaliveRef.current;
            rerunKeepaliveRef.current = false;
            await sendPending(session, keepalive);
          } while (
            rerunRef.current &&
            isCurrent(session) &&
            pendingRef.current.size > 0
          );
        } finally {
          // 그 사이 세션이 바뀌어 새 저장이 시작됐으면 그쪽 표시를 지우지 않습니다.
          if (flushSeqRef.current === seq) inFlightRef.current = null;
        }
      })();
      inFlightRef.current = run;
      return run;
    },
    [isCurrent, sendPending],
  );

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, latestRef.current.debounceMs);
  }, [flush]);

  const enqueue = useCallback(
    (writes: readonly ResponseWrite[]) => {
      if (writes.length === 0) return;
      for (const write of writes) {
        pendingRef.current.set(responseKey(write.block_id, write.field_key), write);
      }
      setBlockSaves((previous) => {
        const next = { ...previous };
        for (const blockId of new Set(writes.map((write) => write.block_id))) {
          next[blockId] = {
            pending: true,
            savedAt: previous[blockId]?.savedAt ?? null,
            failure: null,
          };
        }
        return next;
      });
    },
    [],
  );

  // 불러오기: 캐시를 먼저 그리고, 서버 값이 오면 합칩니다
  // (mergeLoadedResponses). 다른 기기에서 쓴 최신 응답이 이 기기의 옛
  // 캐시에 지워지면 안 되고, 이 기기에서 아직 못 보낸 답은 보내야 합니다.
  useEffect(() => {
    const session: Session = {
      bookId,
      viewerId,
      canSave,
      generation: sessionRef.current.generation + 1,
    };
    sessionRef.current = session;
    pendingRef.current = new Map();
    // 이전 세션의 저장이 아직 나가 있으면 끝날 때까지 기다린 뒤 보냅니다.
    // 같은 사람·책을 다시 불러온 것이면(다시 시도) 같은 답을 두 요청이 나눠
    // 실어 옛 값이 나중에 커밋될 수 있습니다(3-P0-3과 같은 경합).
    const previousFlight = inFlightRef.current;
    inFlightRef.current = null;
    rerunRef.current = false;
    rerunKeepaliveRef.current = false;
    loadFailedRef.current = false;
    hydratedRef.current = false;
    sessionRejectedRef.current = new Set();
    // 화면에 그리기 전에도 setAnswer가 이 사람의 캐시 위에서 쓰게 합니다.
    // 빈 값에서 시작하면 로딩 중 입력 하나가 캐시 전체를 덮습니다.
    cacheRef.current = readResponseCache(bookId, viewerId);

    let cancelled = false;

    async function hydrate() {
      // 이펙트 본문에서 곧바로 setState 하지 않습니다
      // (react-hooks/set-state-in-effect, 첫 렌더가 서버 렌더와 어긋남).
      await Promise.resolve();
      if (cancelled) return;

      setCache(cacheRef.current);
      setBlockSaves({});
      setSaveError(null);
      if (!canSave) {
        setSaveState("local-only");
        return;
      }

      let loaded;
      try {
        loaded = await latestRef.current.client.load(bookId);
      } catch {
        loaded = null;
      }
      if (cancelled) return;

      await previousFlight?.catch(() => undefined);
      if (cancelled) return;

      if (loaded === null) {
        // 서버 값과 겨룰 수 없으니 미전송 답을 보내지 않습니다. 다른 기기의
        // 최신 답을 덮을 수 있습니다. "다시 시도"가 다시 불러옵니다.
        loadFailedRef.current = true;
        // 불러오지 못해도 새로 쓰는 답은 보냅니다. 캐시의 미전송 답만 겨룰
        // 수 없어서 보내지 않습니다.
        hydratedRef.current = true;
        if (pendingRef.current.size > 0) schedule();
        setSaveState("error");
        setSaveError(LOAD_ERROR);
        return;
      }

      // 지금의 캐시로 합칩니다. await 전에 찍어 둔 것으로 합치면 로딩 중에
      // 쓴 답이 화면에서 지워집니다(코드 리뷰 3-P0-5). 로딩 중 입력은
      // setAnswer가 캐시에 "방금 쓴 미전송"으로 남겼으므로 여기서 이깁니다.
      const merged = mergeLoadedResponses(cacheRef.current, loaded);
      commit(merged.cache);
      enqueue(merged.resend);
      hydratedRef.current = true;

      if (pendingRef.current.size > 0) {
        setSaveState("saving");
        schedule();
      } else {
        setSaveState("idle");
      }
    }

    void hydrate();

    // 탭을 닫거나 다른 앱으로 넘어갈 때 남은 배치를 밀어 넣습니다. 모바일은
    // 앱 전환 때 pagehide 없이 visibilitychange(hidden)만 오는 경우가 많습니다.
    function leave() {
      if (!sessionRef.current.canSave) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // 진행 중이면 겹쳐 보내지 않고, 그 저장이 끝난 뒤 이어서 보내게 합니다
      // (flush가 rerun을 세움). 그냥 돌아가면 마지막 디바운스 구간의 답이
      // 다음에 이 책을 열 때까지 서버에 가지 않았습니다.
      if (inFlightRef.current) rerunKeepaliveRef.current = true;
      void flush({ keepalive: true });
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") leave();
    }

    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onVisibilityChange);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // 언마운트(같은 사람이 리더를 떠남)면 남은 답을 보냅니다. 사람이나 책이
      // 바뀐 것이면 보내지 않습니다 — 쿠키는 이미 새 세션이라 A의 답이 B의
      // 행이 됩니다(코드 리뷰 3-P1-6). 답은 A의 캐시 칸에 미전송으로 남아
      // A가 다시 열 때 갑니다.
      const latest = latestRef.current;
      if (latest.viewerId === viewerId && latest.bookId === bookId) leave();
    };
  }, [bookId, viewerId, canSave, reloadToken, commit, enqueue, flush, schedule]);

  const setAnswer = useCallback(
    (blockId: string, fieldKey: string, value: WorkbookAnswer) => {
      // ID가 없거나 저장할 수 없는 키는 받지 않습니다. 큐에 들어가면 서버가
      // 거절할 뿐이고, ID 없는 블록끼리는 답 하나를 나눠 갖게 됩니다.
      if (!isStorableBlockId(blockId) || !isStorableFieldKey(fieldKey)) return;

      const previous = cacheRef.current;
      const writtenAt = Date.now();
      commit({
        answers: {
          ...previous.answers,
          [blockId]: { ...previous.answers[blockId], [fieldKey]: value },
        },
        unsent: withMark(previous.unsent, blockId, fieldKey, writtenAt),
        rejected: withoutMark(previous.rejected, blockId, fieldKey),
      });

      if (!sessionRef.current.canSave) {
        setSaveState("local-only");
        return;
      }

      enqueue([
        { block_id: blockId, field_key: fieldKey, value, written_at: writtenAt },
      ]);
      schedule();
    },
    [commit, enqueue, schedule],
  );

  const retry = useCallback(() => {
    if (loadFailedRef.current) {
      setReloadToken((token) => token + 1);
      return;
    }
    // 확인되지 않은 답을 전부 다시 보냅니다 — 실패한 배치, 권한 문제로 큐에서
    // 뺀 답, 거절된 답(저자가 고쳤을 수 있습니다). 예전에는 큐만 다시 보내서,
    // 큐가 비어 있으면 아무 일도 일어나지 않았습니다.
    const current = cacheRef.current;
    enqueue([
      ...markedWrites(current, current.unsent),
      ...markedWrites(current, current.rejected),
    ]);
    void flush();
  }, [enqueue, flush]);

  const value = useMemo<WorkbookResponsesValue>(
    () => ({ cache, blockSaves, setAnswer, saveState, saveError, retry }),
    [cache, blockSaves, setAnswer, saveState, saveError, retry],
  );

  return (
    <WorkbookResponsesContext.Provider value={value}>
      {children}
    </WorkbookResponsesContext.Provider>
  );
}

/**
 * 서버가 받은 답은 미전송 표시를 지우고, 거절한 답은 거절 표시로 옮깁니다.
 * 그 사이 값이 또 바뀐 답은 그대로 둡니다 — 새 값은 아직 안 갔습니다.
 */
function applySettled(
  cache: ResponseCache,
  chunk: readonly ResponseWrite[],
  rejectedKeys: ReadonlySet<string>,
): ResponseCache {
  let unsent: UnsentMarks = cache.unsent;
  let rejected: UnsentMarks = cache.rejected;

  for (const write of chunk) {
    const { block_id: blockId, field_key: fieldKey } = write;
    if (cache.answers[blockId]?.[fieldKey] !== write.value) continue;

    const writtenAt = cache.unsent[blockId]?.[fieldKey] ?? Date.now();
    unsent = withoutMark(unsent, blockId, fieldKey);
    rejected = rejectedKeys.has(responseKey(blockId, fieldKey))
      ? withMark(rejected, blockId, fieldKey, writtenAt)
      : withoutMark(rejected, blockId, fieldKey);
  }

  return { answers: cache.answers, unsent, rejected };
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
 *
 * `canWrite`가 false면 이 블록은 답을 받을 수 없습니다(`data-node-id`가
 * 없거나 UUID가 아님). 입력을 막고 그렇다고 알리세요.
 */
export function useBlockResponses(blockId: string) {
  const context = useContext(WorkbookResponsesContext);
  if (!context) {
    throw new Error(
      "워크북 블록은 WorkbookResponsesProvider 안에서만 그릴 수 있습니다. " +
        "provider 없이 그리면 응답이 저장되지 않은 채 저장된 것처럼 보입니다.",
    );
  }

  const { cache, setAnswer } = context;
  const canWrite = isStorableBlockId(blockId);
  const save = context.blockSaves[blockId] ?? NO_SAVE;
  // 다시 열었을 때도, 거절된 답이 남은 블록은 그렇다고 말합니다.
  const rejectedEarlier =
    canWrite && Object.keys(cache.rejected[blockId] ?? {}).length > 0;

  return {
    canWrite,
    answers: canWrite ? (cache.answers[blockId] ?? NO_ANSWERS) : NO_ANSWERS,
    save:
      save.failure === null && rejectedEarlier
        ? { ...save, failure: "rejected" as const }
        : save,
    retry: context.retry,
    setAnswer: (fieldKey: string, value: WorkbookAnswer) =>
      setAnswer(blockId, fieldKey, value),
  };
}
