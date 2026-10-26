import { readRedirectParam } from "@/lib/safe-redirect";
import SignupForm from "./SignupForm";

/** `?redirect=`는 로그인 화면의 가입 링크가 실어 보냅니다. 가입 메일을 거쳐 그곳으로 돌아옵니다. */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { redirect } = await searchParams;

  return (
    <SignupForm
      redirect={readRedirectParam(redirect)}
    />
  );
}
