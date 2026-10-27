import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * auth store 초기화 (코드 리뷰 13-P1-2·P2-6·P2-7). 세션 조회가 던져도
 * 리스너가 붙고, 두 번 불러도 구독은 하나이며, 같은 사람의 SIGNED_IN은
 * user 참조를 바꾸지 않습니다.
 */

type Listener = (event: string, session: { user: { id: string } } | null) => void;

const mocks = vi.hoisted(() => ({
  listeners: [] as Listener[],
  getSession: (async () => ({ data: { session: null } })) as () => Promise<unknown>,
  profileReads: 0,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: () => mocks.getSession(),
      onAuthStateChange: (cb: Listener) => {
        mocks.listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            mocks.profileReads += 1;
            return { data: { user_id: "u1" }, error: null };
          },
        }),
      }),
    }),
  }),
}));

async function freshStore() {
  vi.resetModules();
  return (await import("./auth-store")).useAuthStore;
}

beforeEach(() => {
  mocks.listeners = [];
  mocks.profileReads = 0;
  mocks.getSession = async () => ({ data: { session: null } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useAuthStore.initialize", () => {
  it("세션 조회가 던져도 리스너가 붙어 이후 로그인을 받는다", async () => {
    mocks.getSession = async () => {
      throw new TypeError("Failed to fetch");
    };
    const store = await freshStore();
    await store.getState().initialize();

    expect(store.getState().isInitialized).toBe(true);
    expect(mocks.listeners).toHaveLength(1);

    mocks.listeners[0]("SIGNED_IN", { user: { id: "u1" } });
    expect(store.getState().user?.id).toBe("u1");
  });

  it("두 번 불러도 구독은 하나", async () => {
    const store = await freshStore();
    await Promise.all([store.getState().initialize(), store.getState().initialize()]);
    await store.getState().initialize();
    expect(mocks.listeners).toHaveLength(1);
  });

  it("같은 사람의 SIGNED_IN은 user 참조를 바꾸지 않고 프로필도 다시 읽지 않는다", async () => {
    const user = { id: "u1" };
    mocks.getSession = async () => ({ data: { session: { user } } });
    const store = await freshStore();
    await store.getState().initialize();
    expect(mocks.profileReads).toBe(1);

    const before = store.getState().user;
    mocks.listeners[0]("SIGNED_IN", { user: { id: "u1" } });
    await new Promise((r) => setTimeout(r, 0));

    expect(store.getState().user).toBe(before);
    expect(mocks.profileReads).toBe(1);
  });

  it("다른 사람으로 바뀌면 프로필을 비우고 다시 읽는다", async () => {
    mocks.getSession = async () => ({ data: { session: { user: { id: "u1" } } } });
    const store = await freshStore();
    await store.getState().initialize();

    mocks.listeners[0]("SIGNED_IN", { user: { id: "u2" } });
    expect(store.getState().user?.id).toBe("u2");
    expect(store.getState().profile).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.profileReads).toBe(2);
  });
});
