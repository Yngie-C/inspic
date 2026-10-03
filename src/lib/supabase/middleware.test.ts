// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  refreshed: [] as CookieToSet[],
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    { cookies }: { cookies: { setAll: (c: CookieToSet[]) => void } },
  ) => ({
    auth: {
      getUser: async () => {
        // getUser()가 토큰을 회전시키면 setAll로 새 쿠키를 씁니다.
        if (auth.refreshed.length > 0) cookies.setAll(auth.refreshed);
        return { data: { user: auth.user } };
      },
    },
  }),
}));

const { updateSession, matchesRoute } = await import("./middleware");

const request = (path: string) => new NextRequest(new URL(path, "https://inspic.test"));

describe("updateSession", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
    auth.user = null;
    auth.refreshed = [];
  });
  afterEach(() => vi.unstubAllEnvs());

  it("로그인한 사용자도 작가 페이지(/author)에는 들어간다", async () => {
    auth.user = { id: "u1" };
    const res = await updateSession(request("/author/u2"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("로그인한 사용자가 /auth 화면에 오면 /creator로 보낸다", async () => {
    auth.user = { id: "u1" };
    for (const path of ["/auth", "/auth/login", "/auth/signup?x=1"]) {
      const res = await updateSession(request(path));
      expect(res.headers.get("location")).toBe("https://inspic.test/creator");
    }
  });

  it("콜백과 비밀번호 재설정은 로그인 상태여도 지나간다", async () => {
    auth.user = { id: "u1" };
    for (const path of ["/auth/callback?code=c", "/auth/reset-password"]) {
      const res = await updateSession(request(path));
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("비로그인으로 보호 경로에 오면 쿼리까지 담아 로그인으로 보낸다", async () => {
    const res = await updateSession(request("/creator/books?tab=sales"));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/auth/login");
    expect([...location.searchParams.keys()]).toEqual(["redirect"]);
    expect(location.searchParams.get("redirect")).toBe("/creator/books?tab=sales");
  });

  it("이름만 비슷한 경로는 보호하지 않는다", async () => {
    const res = await updateSession(request("/myself"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("리디렉트할 때도 getUser()가 갱신한 세션 쿠키를 싣는다", async () => {
    auth.user = { id: "u1" };
    auth.refreshed = [{ name: "sb-auth-token", value: "rotated", options: { path: "/" } }];
    const res = await updateSession(request("/auth/login"));
    expect(res.headers.get("location")).toBe("https://inspic.test/creator");
    expect(res.cookies.get("sb-auth-token")?.value).toBe("rotated");

    auth.user = null;
    const anon = await updateSession(request("/creator"));
    expect(anon.headers.get("location")).toContain("/auth/login");
    expect(anon.cookies.get("sb-auth-token")?.value).toBe("rotated");
  });
});

describe("matchesRoute", () => {
  it("경로 단위로만 일치시킨다", () => {
    expect(matchesRoute("/auth", "/auth")).toBe(true);
    expect(matchesRoute("/auth/login", "/auth")).toBe(true);
    expect(matchesRoute("/author/x", "/auth")).toBe(false);
    expect(matchesRoute("/creator", "/create")).toBe(false);
  });
});
