import { afterEach, describe, expect, it, vi } from "vitest";
import { isStorageImageUrl } from "./storage-image";

afterEach(() => vi.unstubAllEnvs());

describe("isStorageImageUrl", () => {
  it("우리 Storage 공개 버킷의 URL만 참", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    expect(isStorageImageUrl("https://abc.supabase.co/storage/v1/object/public/covers/covers/b/1.png")).toBe(true);
    expect(isStorageImageUrl("https://abc.supabase.co/storage/v1/object/sign/covers/1.png")).toBe(false);
    expect(isStorageImageUrl("https://evil.supabase.co/storage/v1/object/public/covers/1.png")).toBe(false);
    expect(isStorageImageUrl("https://example.com/me.png")).toBe(false);
    expect(isStorageImageUrl("표지 아님")).toBe(false);
  });

  it("환경변수가 없으면 늘 거짓 — 최적화 없이 그린다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(isStorageImageUrl("https://abc.supabase.co/storage/v1/object/public/covers/1.png")).toBe(false);
  });
});
