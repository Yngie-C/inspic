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
  }) => Promise<{ error?: AuthFailure }>;
  signIn: (email: string, password: string) => Promise<{ error?: AuthFailure }>;
  resendConfirmation: (email: string) => Promise<{ error?: AuthFailure }>;
  requestPasswordReset: (email: string) => Promise<{ error?: AuthFailure }>;
  updatePassword: (password: string) => Promise<{ error?: AuthFailure }>;
  signOut: () => Promise<void>;
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,

  initialize: async () => {
    try {
      const supabase = createClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        set({ user: session.user });
        await get().fetchProfile();
      }

      // auth 상태 변경 리스너
      // 프로필 행은 auth.users INSERT 트리거가 만듭니다. 여기서는 읽기만 합니다.
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          set({ user: session.user });
          await get().fetchProfile();
        } else if (event === "SIGNED_OUT") {
          set({ user: null, profile: null });
        }
      });
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  signUp: async ({ email, password, displayName }) => {
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
          emailRedirectTo: callbackUrl(),
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

  resendConfirmation: async (email) => {
    const supabase = createClient();
    return run("resend", () =>
      supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: callbackUrl() },
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

  signOut: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },

  fetchProfile: async () => {
    const { user } = get();
    if (!user) return;

    const supabase = createClient();
    const { data } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      set({ profile: data as UserProfile });
    }
  },
}));
