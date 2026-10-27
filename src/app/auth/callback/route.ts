import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/safe-redirect";
import { linkErrorCase, linkErrorFromParams, type AuthErrorCase } from "@/lib/auth-errors";

/**
 * 가입 확인·비밀번호 재설정 메일의 링크가 돌아오는 곳입니다.
 *
 * 실패하면 이유(만료 / 다른 브라우저 / 잘못된 링크)를 로그인 화면에
 * `?error=`로 넘깁니다. 이메일 같은 개인 정보는 주소에 싣지 않습니다.
 * 돌아갈 곳(`next`)은 `?redirect=`로 함께 넘겨, 인증 메일을 다시 받거나
 * 그냥 로그인해도 보던 책으로 돌아오게 합니다 (코드 리뷰 13-P1-3).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeInternalPath(searchParams.get("next"), "/");
  const isPasswordReset = next === "/auth/reset-password";
  const fail = (reason: AuthErrorCase) => {
    // 재설정 링크가 실패했으면 인증 메일이나 로그인이 아니라 재설정을 다시
    // 요청하라고 안내합니다. 재설정 화면은 돌아갈 곳으로 싣지 않습니다.
    if (isPasswordReset) {
      const query = reason === "link_expired" ? "reset_link_expired" : "reset_link_invalid";
      return NextResponse.redirect(`${origin}/auth/login?error=${query}`);
    }
    const params = new URLSearchParams({ error: reason });
    if (next !== "/") params.set("redirect", next);
    return NextResponse.redirect(`${origin}/auth/login?${params}`);
  };

  // 링크가 만료됐거나 이미 쓰였으면 Supabase가 code 대신 에러를 붙여 보냅니다.
  const linkError = linkErrorFromParams(searchParams);
  if (linkError) return fail(linkError);

  if (!code) return fail("link_invalid");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(linkErrorCase(error.code));

  return NextResponse.redirect(`${origin}${next}`);
}
