import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser()는 JWT를 Supabase 서버에서 검증한다.
  // 실패 시 getSession()으로 폴백하지 않는다 — getSession()은 로컬 쿠키를 검증 없이 읽으므로
  // 위조된 쿠키가 보호 라우트를 통과할 수 있다. 검증 실패는 미인증으로 취급한다.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  // `/reader`는 여기 없습니다. 무료 책과 유료 책의 첫 챕터는
  // 비로그인도 읽기 때문입니다. 무엇을 보여 줄지는 리더가 접근
  // 판정을 받아 정하고, 실제 차단은 RLS가 합니다.
  const protectedRoutes = ["/create", "/my", "/creator"];
  const isProtected = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (request.nextUrl.pathname.startsWith("/auth") && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/creator";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
