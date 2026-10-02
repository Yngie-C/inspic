import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateFieldKey,
  generateNodeId,
  isStorableFieldKey,
  uuidV4FromRandomValues,
} from "./template-node-id";
import { isStorableBlockId } from "./workbook/sync-blocks";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateNodeId", () => {
  it("UUID를 만든다 — workbook_blocks.id(uuid)에 들어가야 한다", () => {
    const id = generateNodeId();
    expect(id).toMatch(UUID_V4);
    expect(isStorableBlockId(id)).toBe(true);
  });

  it("randomUUID가 없는 곳(보안 컨텍스트 밖)에서도 만든다", () => {
    // HTTP LAN 주소·구형 Safari. 여기서 던지면 블록 삽입이 막힙니다.
    const { getRandomValues } = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: getRandomValues.bind(globalThis.crypto),
    });

    const ids = new Set(Array.from({ length: 50 }, () => generateNodeId()));

    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it("대체 경로의 버전·변형 비트가 맞다", () => {
    for (let i = 0; i < 100; i += 1) {
      expect(uuidV4FromRandomValues()).toMatch(UUID_V4);
    }
  });
});

describe("문항 키", () => {
  it("만든 키는 저장할 수 있다", () => {
    expect(isStorableFieldKey(generateFieldKey())).toBe(true);
  });

  it("비었거나 64자를 넘거나 문자열이 아니면 저장할 수 없다", () => {
    expect(isStorableFieldKey("x".repeat(64))).toBe(true);
    expect(isStorableFieldKey("x".repeat(65))).toBe(false);
    expect(isStorableFieldKey("")).toBe(false);
    expect(isStorableFieldKey(7)).toBe(false);
    expect(isStorableFieldKey(undefined)).toBe(false);
  });
});
