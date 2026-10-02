import {
  MAX_RESPONSE_WRITES,
  type RejectedWrite,
  type ResponseWrite,
} from "./response-payload";
import type { WorkbookResponse } from "./types";

/**
 * 리더가 서버와 응답을 주고받는 통로.
 *
 * 인터페이스로 끊어 둔 것은 테스트에서 가짜를 넣기 위해서입니다
 * (`WorkbookSyncClient`와 같은 이유). 리더의 저장 규약 — 낙관적 업데이트,
 * 재시도, 저장 상태 — 은 네트워크 없이도 검증돼야 합니다.
 */

export interface SaveResponsesResult {
  saved: number;
  /** 정의가 DB에 없거나 타입이 어긋나 저장되지 않은 항목. */
  rejected: RejectedWrite[];
}

/**
 * 서버에서 불러온 응답. 캐시의 미전송 답과 어느 쪽이 최신인지 가릴 때
 * `written_at`(없으면 `updated_at`)을 봅니다.
 */
export interface LoadedResponse extends WorkbookResponse {
  updated_at: string;
  /** 독자가 그 답을 쓴 시각(쓴 기기의 시계). 00008 이전 행은 null. */
  written_at: string | null;
}

/**
 * 서버가 분명히 거절한 저장(4xx). 같은 본문을 다시 보내도 같은 답이 옵니다.
 *
 * 이것을 네트워크 오류처럼 다루면 실패한 배치가 큐에 남아 다음 저장마다
 * 다시 실리고, 그 세션의 저장이 전부 막힙니다(코드 리뷰 3-P0-1).
 */
export class ResponseSaveRejectedError extends Error {
  constructor(readonly status: number) {
    super(`응답 저장이 거절됐어요 (${status}).`);
    this.name = "ResponseSaveRejectedError";
  }
}

export interface WorkbookResponseClient {
  load(bookId: string): Promise<LoadedResponse[]>;
  save(
    bookId: string,
    writes: readonly ResponseWrite[],
    options?: { keepalive?: boolean },
  ): Promise<SaveResponsesResult>;
}

export const httpResponseClient: WorkbookResponseClient = {
  async load(bookId) {
    const response = await fetch(`/api/books/${bookId}/responses`);
    if (!response.ok) throw new Error("답을 불러오지 못했어요.");
    const body = (await response.json()) as { data?: LoadedResponse[] };
    return body.data ?? [];
  },

  async save(bookId, writes, options) {
    const response = await fetch(`/api/books/${bookId}/responses`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: writes }),
      // 탭을 닫는 중에도 마지막 배치가 나가야 합니다. keepalive 본문은
      // 브라우저 한도(64KB)가 있어서, 호출부가 chunkWrites로 나눠 보냅니다.
      keepalive: options?.keepalive ?? false,
    });

    if (isPermanentFailure(response.status)) {
      throw new ResponseSaveRejectedError(response.status);
    }
    if (!response.ok) throw new Error("답을 저장하지 못했어요.");

    const body = (await response.json()) as { data?: SaveResponsesResult };
    return body.data ?? { saved: 0, rejected: [] };
  },
};

/** 다시 보내도 결과가 같은 실패. 408(시간 초과)·429(요청 과다)는 다시 보낼 만합니다. */
function isPermanentFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** keepalive 요청 본문의 브라우저 한도는 64KB입니다. 헤더 몫을 남겨 둡니다. */
export const KEEPALIVE_BODY_LIMIT = 60_000;

/**
 * 일반 저장 요청 한 번의 본문 상한. 호스팅의 요청 본문 한도(수 MB)보다
 * 넉넉히 작게 둡니다. 답 하나가 최대 2만 자라 200건이면 수십 MB가 됩니다.
 */
export const REQUEST_BODY_LIMIT = 1_000_000;

/**
 * 쓰기를 요청 단위로 나눕니다. 한 묶음은 {@link MAX_RESPONSE_WRITES}건,
 * 본문 `maxBytes` 바이트를 넘지 않습니다.
 *
 * 한 건만으로 한도를 넘으면 그 건 혼자 한 묶음이 됩니다 — 버리지 않습니다.
 * keepalive로는 못 보내므로 호출부가 일반 요청으로 보냅니다.
 */
export function chunkWrites(
  writes: readonly ResponseWrite[],
  maxBytes: number,
): ResponseWrite[][] {
  const chunks: ResponseWrite[][] = [];
  let current: ResponseWrite[] = [];
  // `{"answers":[]}`와 항목 사이 쉼표.
  const envelope = byteLength('{"answers":[]}');
  let size = envelope;

  for (const write of writes) {
    const itemSize = byteLength(JSON.stringify(write)) + 1;
    if (
      current.length > 0 &&
      (current.length >= MAX_RESPONSE_WRITES || size + itemSize > maxBytes)
    ) {
      chunks.push(current);
      current = [];
      size = envelope;
    }
    current.push(write);
    size += itemSize;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** 묶음 하나가 keepalive 한도 안에 드는가. */
export function fitsKeepalive(writes: readonly ResponseWrite[]): boolean {
  return byteLength(JSON.stringify({ answers: writes })) <= KEEPALIVE_BODY_LIMIT;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
