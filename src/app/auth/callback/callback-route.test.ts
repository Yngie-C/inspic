// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * 메일 링크 콜백 (코드 리뷰 13-P1-3·P2-8). 실패해도 돌아갈 곳을 로그인
 * 화면에 넘기고, 재설정 링크의 실패는 재설정 쪽 안내로 보냅니다.
 */

const mocks = vi.hoisted(() => ({
  exchangeError: null as { code: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: mocks.exchangeError }),
    },
  }),
}));

const { GET } = await import("./route");

async function visit(query: string): Promise<URL> {
  const res = await GET(
    new Request(`http://localhost/auth/callback?${query}`) as unknown as NextRequest,
  );
  return new URL(res.headers.get("location")!);
}

beforeEach(() => {
  mocks.exchangeError = null;
});

describe("GET /auth/callback", () => {
  it("성공하면 next로 보낸다", async () => {
    const to = await visit("code=abc&next=/reader/b1");
    expect(to.pathname).toBe("/reader/b1");
  });

  it("가입 링크가 만료되면 돌아갈 곳을 로그인 화면에 싣는다", async () => {
    const to = await visit("error=access_denied&error_code=otp_expired&next=/reader/b1");
    expect(to.pathname).toBe("/auth/login");
    expect(to.searchParams.get("error")).toBe("link_expired");
    expect(to.searchParams.get("redirect")).toBe("/reader/b1");
  });

  it("돌아갈 곳이 없으면 redirect를 싣지 않는다", async () => {
    const to = await visit("error=access_denied");
    expect(to.searchParams.get("error")).toBe("link_invalid");
    expect(to.searchParams.has("redirect")).toBe(false);
  });

  it("다른 브라우저에서 연 가입 링크는 link_other_browser", async () => {
    mocks.exchangeError = { code: "pkce_code_verifier_not_found" };
    const to = await visit("code=abc&next=/reader/b1");
    expect(to.searchParams.get("error")).toBe("link_other_browser");
    expect(to.searchParams.get("redirect")).toBe("/reader/b1");
  });

  it("재설정 링크가 이미 쓰였거나 다른 브라우저면 재설정 안내로 보낸다", async () => {
    const used = await visit("error=access_denied&next=/auth/reset-password");
    expect(used.searchParams.get("error")).toBe("reset_link_invalid");
    expect(used.searchParams.has("redirect")).toBe(false);

    mocks.exchangeError = { code: "flow_state_not_found" };
    const other = await visit("code=abc&next=/auth/reset-password");
    expect(other.searchParams.get("error")).toBe("reset_link_invalid");
  });

  it("재설정 링크가 만료되면 reset_link_expired", async () => {
    const to = await visit("error=access_denied&error_code=otp_expired&next=/auth/reset-password");
    expect(to.searchParams.get("error")).toBe("reset_link_expired");
  });
});
