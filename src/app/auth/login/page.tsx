import { authFailureFromQuery } from "@/lib/auth-errors";
import { readRedirectParam } from "@/lib/safe-redirect";
import LoginForm from "./LoginForm";

/**
 * `?error=`는 메일 링크가 실패했을 때 `/auth/callback`이 붙여 보냅니다.
 * 서버에서 읽어 넘기면 클라이언트가 이펙트에서 상태를 바꿀 필요가 없습니다.
 *
 * `?redirect=`는 로그인 뒤 돌아갈 곳입니다. 리더처럼 로그인이 필요한 화면이
 * 넘겨 주고, 가입 링크에도 실어 가입 메일을 거쳐도 돌아오게 합니다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error, redirect } = await searchParams;
  const initialFailure = authFailureFromQuery(
    typeof error === "string" ? error : null,
  );

  return (
    <LoginForm
      initialFailure={initialFailure}
      redirect={readRedirectParam(redirect)}
    />
  );
}
