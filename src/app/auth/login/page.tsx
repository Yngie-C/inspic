import { authFailureFromQuery } from "@/lib/auth-errors";
import LoginForm from "./LoginForm";

/**
 * `?error=`는 메일 링크가 실패했을 때 `/auth/callback`이 붙여 보냅니다.
 * 서버에서 읽어 넘기면 클라이언트가 이펙트에서 상태를 바꿀 필요가 없습니다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  const initialFailure = authFailureFromQuery(
    typeof error === "string" ? error : null,
  );

  return <LoginForm initialFailure={initialFailure} />;
}
