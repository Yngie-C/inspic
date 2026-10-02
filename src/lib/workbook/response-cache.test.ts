import { beforeEach, describe, expect, it } from "vitest";
import {
  mergeLoadedResponses,
  readResponseCache,
  withMark,
  withoutMark,
  writeResponseCache,
  type ResponseCache,
} from "./response-cache";
import { chunkWrites, KEEPALIVE_BODY_LIMIT, fitsKeepalive } from "./response-client";
import type { LoadedResponse } from "./response-client";
import { MAX_RESPONSE_WRITES } from "./response-payload";

const BOOK = "22222222-2222-4222-8222-222222222222";
const BLOCK = "11111111-1111-4111-8111-111111111111";

function serverText(value: string, updatedAt: string): LoadedResponse {
  return {
    block_id: BLOCK,
    field_key: "answer",
    value_text: value,
    value_number: null,
    value_bool: null,
    updated_at: updatedAt,
    written_at: null,
  };
}

function cacheWith(
  answer: string,
  marks: { unsent?: number; rejected?: number } = {},
): ResponseCache {
  return {
    answers: { [BLOCK]: { answer } },
    unsent: marks.unsent === undefined ? {} : { [BLOCK]: { answer: marks.unsent } },
    rejected:
      marks.rejected === undefined ? {} : { [BLOCK]: { answer: marks.rejected } },
  };
}

const SEPT = Date.parse("2026-09-01T00:00:00Z");
const OCT = "2026-10-01T00:00:00Z";

describe("mergeLoadedResponses", () => {
  it("서버 값에서 시작한다 — 표시 없는 캐시 값은 버린다", () => {
    const { cache, resend } = mergeLoadedResponses(cacheWith("이 기기의 옛 값"), []);
    expect(cache.answers).toEqual({});
    expect(resend).toEqual([]);
  });

  it("서버에 없는 미전송 답은 남기고 다시 보낸다", () => {
    const { cache, resend } = mergeLoadedResponses(
      cacheWith("못 보낸 답", { unsent: SEPT }),
      [],
    );
    expect(cache.answers[BLOCK]).toEqual({ answer: "못 보낸 답" });
    expect(resend).toEqual([
      { block_id: BLOCK, field_key: "answer", value: "못 보낸 답", written_at: SEPT },
    ]);
  });

  it("서버가 더 나중에 고쳐졌으면 서버를 따르고 표시를 지운다", () => {
    const { cache, resend } = mergeLoadedResponses(
      cacheWith("옛 기기의 답", { unsent: SEPT }),
      [serverText("새 기기의 답", OCT)],
    );
    expect(cache.answers[BLOCK]).toEqual({ answer: "새 기기의 답" });
    expect(cache.unsent).toEqual({});
    expect(resend).toEqual([]);
  });

  it("미전송 답이 서버보다 나중이면 미전송 답이 이긴다", () => {
    const later = Date.parse("2026-11-01T00:00:00Z");
    const { cache, resend } = mergeLoadedResponses(
      cacheWith("방금 쓴 답", { unsent: later }),
      [serverText("서버의 옛 답", OCT)],
    );
    expect(cache.answers[BLOCK]).toEqual({ answer: "방금 쓴 답" });
    expect(resend).toHaveLength(1);
  });

  it("서버 시계(updated_at)가 아니라 독자가 쓴 시각(written_at)으로 겨룬다", () => {
    // 'ab' 저장이 나가 있는 동안 'abc'를 쓰고 탭을 닫으면 'ab'가 더 늦게
    // 커밋됩니다. updated_at으로 겨루면 방금 쓴 'abc'가 졌습니다(WP5 리뷰).
    const typedAbc = Date.parse("2026-10-01T00:00:02Z");
    const { cache, resend } = mergeLoadedResponses(
      cacheWith("abc", { unsent: typedAbc }),
      [
        {
          ...serverText("ab", "2026-10-01T00:00:05Z"),
          written_at: "2026-10-01T00:00:01Z",
        },
      ],
    );
    expect(cache.answers[BLOCK]).toEqual({ answer: "abc" });
    expect(resend).toEqual([
      { block_id: BLOCK, field_key: "answer", value: "abc", written_at: typedAbc },
    ]);
  });

  it("거절된 답은 화면에 남기되 저절로 다시 보내지 않는다", () => {
    const { cache, resend } = mergeLoadedResponses(
      cacheWith("거절된 답", { rejected: SEPT }),
      [],
    );
    expect(cache.answers[BLOCK]).toEqual({ answer: "거절된 답" });
    expect(cache.rejected).toEqual({ [BLOCK]: { answer: SEPT } });
    expect(resend).toEqual([]);
  });
});

describe("응답 캐시 저장소", () => {
  beforeEach(() => localStorage.clear());

  it("쓴 것을 그대로 읽는다", () => {
    const cache = cacheWith("답", { unsent: SEPT });
    writeResponseCache(BOOK, "reader", cache);
    expect(readResponseCache(BOOK, "reader")).toEqual(cache);
  });

  it("값이 없는 표시는 읽지 않는다", () => {
    writeResponseCache(BOOK, "reader", {
      answers: {},
      unsent: { [BLOCK]: { answer: SEPT } },
      rejected: {},
    });
    expect(readResponseCache(BOOK, "reader").unsent).toEqual({});
  });

  it("버전 표시가 없는 예전 캐시는 '쓴 시각 0의 미전송'으로 읽는다", () => {
    // 예전에는 보내지 못한 답을 구분하지 않았습니다. 서버에 그 답이 아예
    // 없을 때만 다시 보내고, 서버에 값이 있으면 서버를 따릅니다.
    // 예전 형식은 지금 코드로 만들 수 없어 저장소 키를 찾아 직접 넣습니다.
    writeResponseCache(BOOK, "reader", cacheWith("x"));
    const key = Object.keys(localStorage).find((k) => k.endsWith(BOOK));
    expect(key).toBeDefined();
    localStorage.setItem(key!, JSON.stringify({ [BLOCK]: { answer: "예전 답" } }));

    const legacy = readResponseCache(BOOK, "reader");
    expect(legacy.unsent).toEqual({ [BLOCK]: { answer: 0 } });
    expect(mergeLoadedResponses(legacy, []).resend).toHaveLength(1);
    expect(
      mergeLoadedResponses(legacy, [serverText("서버 답", OCT)]).cache.answers[BLOCK],
    ).toEqual({ answer: "서버 답" });
  });
});

describe("표시 고치기", () => {
  it("마지막 표시를 빼면 블록 칸도 지운다", () => {
    const marks = withMark({}, BLOCK, "answer", 1);
    expect(withoutMark(marks, BLOCK, "answer")).toEqual({});
    expect(withoutMark(marks, BLOCK, "other")).toBe(marks);
  });
});

describe("chunkWrites", () => {
  const write = (i: number, value = "x") => ({
    block_id: BLOCK,
    field_key: `k${i}`,
    value,
  });

  it("200건을 넘으면 나눈다 — 서버가 통째로 거절하지 않게", () => {
    const writes = Array.from({ length: MAX_RESPONSE_WRITES + 1 }, (_, i) => write(i));
    expect(chunkWrites(writes, Infinity).map((chunk) => chunk.length)).toEqual([
      MAX_RESPONSE_WRITES,
      1,
    ]);
  });

  it("keepalive 64KB에 맞게 나눈다 — 긴 한국어 답 두 개도 나간다", () => {
    // 2만 자 답 하나가 UTF-8로 약 6만 바이트입니다(3-P1-4).
    const long = "가".repeat(12000);
    const chunks = chunkWrites([write(1, long), write(2, long)], KEEPALIVE_BODY_LIMIT);
    expect(chunks).toHaveLength(2);
    expect(chunks.every(fitsKeepalive)).toBe(true);
  });

  it("한 건이 한도보다 커도 버리지 않고 혼자 한 묶음이 된다", () => {
    const huge = write(1, "가".repeat(20000));
    const chunks = chunkWrites([huge, write(2)], KEEPALIVE_BODY_LIMIT);
    expect(chunks).toEqual([[huge], [write(2)]]);
    expect(fitsKeepalive(chunks[0])).toBe(false);
  });
});
