import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/types";
import type { User } from "@supabase/supabase-js";

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
  }) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  /** `next`는 로그인 후 돌아갈 같은 사이트 경로입니다 (콜백이 검증합니다). */
  signInWithOAuth: (
    provider: 'google' | 'kakao',
    next?: string,
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
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

    // display_name은 user_metadata로만 넘깁니다.
    // user_profiles 행은 auth.users INSERT 트리거가 이 값을 읽어 생성합니다.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });

    if (error) return { error: error.message };

    return {};
  },

  signIn: async (email, password) => {
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { error: error.message };
    return {};
  },

  signInWithOAuth: async (provider, next) => {
    const supabase = createClient();
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callback.toString(),
      },
    });
    if (error) return { error: error.message };
    return {};
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
