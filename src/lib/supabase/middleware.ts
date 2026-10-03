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

  const { pathname, search } = request.nextUrl;

  // `/reader`는 여기 없습니다. 무료 책과 유료 책의 첫 챕터는
  // 비로그인도 읽기 때문입니다. 무엇을 보여 줄지는 리더가 접근
  // 판정을 받아 정하고, 실제 차단은 RLS가 합니다.
  const protectedRoutes = ["/create", "/my", "/creator"];
  const isProtected = protectedRoutes.some((route) => matchesRoute(pathname, route));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    // 원래 쿼리를 로그인 주소에 섞지 않고, 돌아갈 주소 안에만 담습니다.
    url.search = "";
    url.searchParams.set("redirect", `${pathname}${search}`);
    return redirectWithSession(url, supabaseResponse);
  }

  // 콜백과 비밀번호 재설정은 메일 링크로 세션이 생긴 직후에 거쳐 가는
  // 곳이라 로그인 상태여도 들어와야 합니다.
  const authPassthrough = ["/auth/callback", "/auth/reset-password"];
  const isAuthPassthrough = authPassthrough.some((route) => matchesRoute(pathname, route));

  if (matchesRoute(pathname, "/auth") && user && !isAuthPassthrough) {
    const url = request.nextUrl.clone();
    url.pathname = "/creator";
    url.search = "";
    return redirectWithSession(url, supabaseResponse);
  }

  return supabaseResponse;
}

/**
 * 경로 단위로 비교합니다. `startsWith("/auth")`로 보면 `/author/...`까지
 * 걸려, 로그인한 사용자가 작가 페이지에 들어가지 못하고 `/creator`로 튕깁니다.
 */
export function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * 리디렉트 응답에 `getUser()`가 갱신한 세션 쿠키를 옮겨 담습니다.
 *
 * 새 `NextResponse.redirect`만 돌려주면 `setAll`이 `supabaseResponse`에
 * 써 둔 쿠키가 버려집니다. 그사이 refresh token이 회전됐다면 브라우저에는
 * 이미 폐기된 옛 토큰이 남아, 다음 요청에서 예고 없이 로그아웃됩니다.
 */
function redirectWithSession(url: URL, supabaseResponse: NextResponse): NextResponse {
  const response = NextResponse.redirect(url);
  for (const cookie of supabaseResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  return response;
}
