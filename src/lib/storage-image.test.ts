import { afterEach, describe, expect, it, vi } from "vitest";
import { isChapterImageUrl, isStorageImageUrl, storagePublicPath } from "./storage-image";

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

describe("isStorageImageUrl — 로컬 Supabase (코드 리뷰 10-P2-11)", () => {
  it("로컬 호스트는 최적화하지 않는다 — Next 16 최적화 서버가 로컬 IP를 받지 않는다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    expect(isStorageImageUrl("http://127.0.0.1:54321/storage/v1/object/public/covers/1.png")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    expect(isStorageImageUrl("http://localhost:54321/storage/v1/object/public/covers/1.png")).toBe(false);
  });
});

describe("storagePublicPath — 우리 Storage 판정 한 벌 (코드 리뷰 10-P1-14)", () => {
  it("우리 origin의 공개 경로 뒤만 꺼낸다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    expect(storagePublicPath("https://abc.supabase.co/storage/v1/object/public/covers/covers/b/1.png")).toBe(
      "covers/covers/b/1.png",
    );
  });

  it("다른 origin이거나 공개 경로가 맨 앞에 없으면 null", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    expect(storagePublicPath("https://other.example/x/storage/v1/object/public/covers/1.png")).toBeNull();
    expect(storagePublicPath("https://abc.supabase.co/x/storage/v1/object/public/covers/1.png")).toBeNull();
    expect(storagePublicPath("http://abc.supabase.co/storage/v1/object/public/covers/1.png")).toBeNull();
    expect(storagePublicPath("https://abc.supabase.co:8443/storage/v1/object/public/covers/1.png")).toBeNull();
  });
});

describe("isChapterImageUrl — 본문 이미지 (코드 리뷰 12-P2-1)", () => {
  it("우리 chapter-images 공개 버킷의 파일만 참", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    expect(isChapterImageUrl("https://abc.supabase.co/storage/v1/object/public/chapter-images/b/c/1.png")).toBe(true);
    expect(isChapterImageUrl("https://abc.supabase.co/storage/v1/object/public/chapter-images/")).toBe(false);
    expect(isChapterImageUrl("https://abc.supabase.co/storage/v1/object/public/covers/covers/b/1.png")).toBe(false);
    expect(isChapterImageUrl("https://evil.supabase.co/storage/v1/object/public/chapter-images/b/c/1.png")).toBe(false);
    expect(isChapterImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isChapterImageUrl("")).toBe(false);
  });

  it("환경변수가 없으면 늘 거짓", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(isChapterImageUrl("https://abc.supabase.co/storage/v1/object/public/chapter-images/b/c/1.png")).toBe(false);
  });
});
