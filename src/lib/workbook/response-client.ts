import type { RejectedWrite, ResponseWrite } from "./response-payload";
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

export interface WorkbookResponseClient {
  load(bookId: string): Promise<WorkbookResponse[]>;
  save(
    bookId: string,
    writes: readonly ResponseWrite[],
    options?: { keepalive?: boolean },
  ): Promise<SaveResponsesResult>;
}

export const httpResponseClient: WorkbookResponseClient = {
  async load(bookId) {
    const response = await fetch(`/api/books/${bookId}/responses`);
    if (!response.ok) throw new Error("응답을 불러오지 못했습니다.");
    const body = (await response.json()) as { data?: WorkbookResponse[] };
    return body.data ?? [];
  },

  async save(bookId, writes, options) {
    const response = await fetch(`/api/books/${bookId}/responses`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: writes }),
      // 탭을 닫는 중에도 마지막 배치가 나가야 합니다. 본문은 디바운스된
      // 몇 건이라 keepalive의 64KB 제한 안에 들어옵니다.
      keepalive: options?.keepalive ?? false,
    });

    if (!response.ok) throw new Error("응답을 저장하지 못했습니다.");

    const body = (await response.json()) as { data?: SaveResponsesResult };
    return body.data ?? { saved: 0, rejected: [] };
  },
};
