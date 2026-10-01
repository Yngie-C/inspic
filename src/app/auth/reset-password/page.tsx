"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import {
  authFailure,
  checkPassword,
  PASSWORD_HINT,
  type AuthFailure,
} from "@/lib/auth-errors";
import { FormAlert } from "@/components/auth/FormAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * 재설정 메일의 링크가 `/auth/callback`을 거쳐 세션을 만든 뒤 오는 곳.
 * 세션이 없으면(링크 만료·직접 접근) 바꿀 수 없으므로 처음부터 안내합니다.
 */
export default function ResetPasswordPage() {
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const updatePassword = useAuthStore((s) => s.updatePassword);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [done, setDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const sessionFailure =
    isInitialized && !user ? authFailure("session_missing", "update") : null;
  const shown = failure ?? sessionFailure;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailure(null);
    const passwordProblem = checkPassword(password);
    const mismatch =
      !passwordProblem && password !== confirmPassword
        ? "비밀번호가 서로 달라요. 다시 확인해 주세요."
        : "";
    setPasswordError(passwordProblem ?? "");
    setConfirmError(mismatch);
    if (passwordProblem || mismatch) return;
    setIsLoading(true);

    try {
      const result = await updatePassword(password);
      if (result.error) {
        setFailure(result.error);
      } else {
        setDone(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <Card className="rounded-lg border border-line">
        <CardHeader>
          <CardTitle className="text-2xl">비밀번호를 바꿨어요</CardTitle>
          <CardDescription>
            다음부터는 새 비밀번호로 로그인해 주세요.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button asChild>
            <Link href="/creator">계속하기</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg border border-line">
      <CardHeader>
        <CardTitle className="text-2xl">새 비밀번호 정하기</CardTitle>
        <CardDescription>앞으로 로그인할 때 쓸 비밀번호를 입력해 주세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {shown && !shown.field && (
            <FormAlert>
              <p>{shown.message}</p>
              {shown.action === "reset" && (
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
            label="새 비밀번호"
            type="password"
            placeholder={PASSWORD_HINT}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            error={
              passwordError ||
              (shown?.field === "password" ? shown.message : undefined)
            }
          />
          <Input
            label="새 비밀번호 확인"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            error={confirmError || undefined}
          />
          <Button
            type="submit"
            isLoading={isLoading}
            disabled={!!sessionFailure}
            className="mt-2 w-full"
          >
            비밀번호 바꾸기
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <Link
          href="/auth/login"
          className="text-sm font-medium text-primary hover:underline"
        >
          로그인으로 돌아가기
        </Link>
      </CardFooter>
    </Card>
  );
}
