"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import { safeInternalPath } from "@/lib/safe-redirect";
import type { AuthFailure } from "@/lib/auth-errors";
import { FormAlert } from "@/components/auth/FormAlert";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginForm({
  initialFailure,
}: {
  initialFailure: AuthFailure | null;
}) {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(initialFailure);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * 로그인 후 돌아갈 곳. 리더처럼 로그인이 필요한 화면이 `?redirect=`로
   * 넘겨 줍니다. `useSearchParams()` 대신 여기서 읽는 것은 Suspense
   * 경계를 강제하지 않기 위해서이고, 값은 제출 시점에만 필요합니다.
   */
  const redirectTarget = () =>
    safeInternalPath(
      new URLSearchParams(window.location.search).get("redirect"),
      "/creator",
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailure(null);
    setIsLoading(true);

    try {
      const result = await signIn(email, password);
      if (result.error) {
        setFailure(result.error);
      } else {
        router.push(redirectTarget());
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <Card className="rounded-lg border border-line">
        <CardHeader>
          <CardTitle className="text-2xl">로그인</CardTitle>
          <CardDescription>이메일과 비밀번호를 입력해 주세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {failure && !failure.field && (
              <FormAlert>
                <p>{failure.message}</p>
                {failure.action === "resend" && <ResendConfirmation email={email} />}
                {failure.action === "reset" && (
                  <Link
                    href="/auth/forgot-password"
                    className="self-start font-semibold text-primary underline decoration-1 underline-offset-3"
                  >
                    비밀번호 찾기
                  </Link>
                )}
              </FormAlert>
            )}
            <Input
              label="이메일"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              error={failure?.field === "email" ? failure.message : undefined}
            />
            <Input
              label="비밀번호"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              error={failure?.field === "password" ? failure.message : undefined}
            />
            <Link
              href="/auth/forgot-password"
              className="-mt-2 self-end text-caption text-muted hover:text-primary hover:underline"
            >
              비밀번호를 잊었나요?
            </Link>
            <Button type="submit" isLoading={isLoading} className="w-full mt-2">
              로그인
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted">
            계정이 없나요?{" "}
            <Link href="/auth/signup" className="font-medium text-primary hover:underline">
              회원가입
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
