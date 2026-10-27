import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/types";
import type { User } from "@supabase/supabase-js";
import { authFailure, toAuthFailure, type AuthFailure } from "@/lib/auth-errors";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  signUp: (data: {
    email: string;
    password: string;
    displayName?: string;
    /** 메일 인증 뒤 돌아갈 곳. `safeInternalPath()`를 거친 값. */
    next?: string;
  }) => Promise<{ error?: AuthFailure }>;
  signIn: (email: string, password: string) => Promise<{ error?: AuthFailure }>;
  resendConfirmation: (
    email: string,
    next?: string,
  ) => Promise<{ error?: AuthFailure }>;
  requestPasswordReset: (email: string) => Promise<{ error?: AuthFailure }>;
  updatePassword: (password: string) => Promise<{ error?: AuthFailure }>;
  signOut: () => Promise<{ error?: unknown }>;
  fetchProfile: () => Promise<void>;
}

/**
 * 메일 링크가 돌아올 곳. 콜백을 거쳐야 링크가 만료됐을 때 그 이유를
 * 로그인 화면에 안내할 수 있습니다.
 */
const callbackUrl = (next?: string) => {
  const url = new URL("/auth/callback", window.location.origin);
  if (next) url.searchParams.set("next", next);
  return url.toString();
};

/**
 * supabase-js는 대부분의 실패를 `{ error }`로 돌려주지만 네트워크가
 * 끊기면 던지기도 합니다. 어느 쪽이든 같은 안내로 모읍니다.
 */
async function run(
  ctx: Parameters<typeof toAuthFailure>[1],
  call: () => Promise<{ error: unknown }>,
): Promise<{ error?: AuthFailure }> {
  try {
    const { error } = await call();
    return error ? { error: toAuthFailure(error, ctx) } : {};
  } catch (error) {
    return { error: toAuthFailure(error, ctx) };
  }
}

let initializeStarted = false;

/**
 * 이 사용자로 store를 맞춥니다. 이미 같은 사람이고 프로필도 있으면 아무것도
 * 바꾸지 않고 false — 호출자는 프로필을 다시 읽지 않습니다.
 */
function adoptUser(user: User): boolean {
  const { user: current, profile } = useAuthStore.getState();
  if (current?.id === user.id) return profile === null;
  // 계정이 바뀌면 이전 사람의 프로필을 먼저 비웁니다.
  useAuthStore.setState({ user, profile: null });
  return true;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,

  initialize: async () => {
    // 한 번만 돕니다. StrictMode·리마운트로 다시 불려도 리스너가 겹치지 않게
    // 합니다 — 겹치면 SIGNED_IN마다 store를 두 번 쓰고 프로필도 두 번 읽습니다
    // (코드 리뷰 13-P2-6). 앱이 사는 동안 구독을 유지하므로 풀지 않습니다.
    if (initializeStarted) return;
    initializeStarted = true;

    try {
      const supabase = createClient();

      // 리스너를 먼저 겁니다. 세션 조회가 던져도 이후의 로그인은 받아야
      // 하고(그러지 않으면 새로고침 전까지 store가 로그아웃 상태입니다),
      // 조회를 기다리는 사이 들어온 이벤트도 놓치지 않습니다 (코드 리뷰 13-P1-2).
      //
      // 프로필 행은 auth.users INSERT 트리거가 만듭니다. 여기서는 읽기만 합니다.
      //
      // 콜백 안에서 Supabase 호출을 await하지 않습니다. supabase-js가 auth 잠금을
      // 쥔 채 이 콜백을 부르는 경우가 있어(탭 복귀 등), 콜백이 조회를 기다리고
      // 조회가 잠금을 기다리며 그 클라이언트의 모든 호출이 멈춥니다.
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          // 탭 복귀마다 같은 사람의 SIGNED_IN이 옵니다. 그때 user 참조를 바꾸면
          // user에 묶인 이펙트가 다시 돌므로 그대로 둡니다 (코드 리뷰 13-P2-7).
          if (!adoptUser(session.user)) return;
          setTimeout(() => void get().fetchProfile(), 0);
        } else if (event === "SIGNED_OUT") {
          set({ user: null, profile: null });
        }
      });

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user && adoptUser(session.user)) {
          await get().fetchProfile();
        }
      } catch (error) {
        console.error("[auth] 세션을 불러오지 못했어요", error);
      }
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  signUp: async ({ email, password, displayName, next }) => {
    const supabase = createClient();
    let alreadyExists = false;

    // display_name은 user_metadata로만 넘깁니다.
    // user_profiles 행은 auth.users INSERT 트리거가 이 값을 읽어 생성합니다.
    const result = await run("signup", async () => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: callbackUrl(next),
        },
      });
      // 이미 인증을 마친 이메일이면 Supabase는 에러 없이 identities가 빈
      // 사용자를 돌려주고 메일은 보내지 않습니다. 그대로 두면 "메일함을
      // 확인해 주세요"만 보고 오지 않는 메일을 기다리게 됩니다.
      alreadyExists = !error && data.user?.identities?.length === 0;
      return { error };
    });

    if (alreadyExists) {
      return { error: authFailure("user_already_exists", "signup") };
    }
    return result;
  },

  signIn: async (email, password) => {
    const supabase = createClient();
    return run("signin", () =>
      supabase.auth.signInWithPassword({ email, password }),
    );
  },

  resendConfirmation: async (email, next) => {
    const supabase = createClient();
    return run("resend", () =>
      supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: callbackUrl(next) },
      }),
    );
  },

  requestPasswordReset: async (email) => {
    const supabase = createClient();
    return run("reset", () =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: callbackUrl("/auth/reset-password"),
      }),
    );
  },

  updatePassword: async (password) => {
    const supabase = createClient();
    return run("update", () => supabase.auth.updateUser({ password }));
  },

  /**
   * 실패하면 세션 쿠키가 남으므로 화면을 로그아웃 상태로 바꾸지 않습니다.
   * 공용 기기에서 로그아웃된 줄 알고 자리를 뜨면 다음 사람이 그 계정을 씁니다.
   */
  signOut: async () => {
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.signOut();
      if (error) return { error };
    } catch (error) {
      return { error };
    }
    set({ user: null, profile: null });
    return {};
  },

  fetchProfile: async () => {
    const { user } = get();
    if (!user) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // 기다리는 사이 계정이 바뀌었으면 이 결과는 다른 사람의 것입니다.
    if (get().user?.id !== user.id) return;

    if (error) {
      // 프로필은 이름 같은 장식 정보라 화면은 그대로 두고 로그만 남깁니다.
      console.error("[auth] 프로필을 불러오지 못했어요", error);
      return;
    }
    set({ profile: (data as UserProfile | null) ?? null });
  },
}));
