"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import { checkPassword, PASSWORD_HINT, type AuthFailure } from "@/lib/auth-errors";
import { FormAlert } from "@/components/auth/FormAlert";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
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

type FieldErrors = Partial<
  Record<"displayName" | "email" | "password" | "confirmPassword", string>
>;

export default function SignupPage() {
  const signUp = useAuthStore((s) => s.signUp);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!displayName.trim()) errors.displayName = "이름을 입력해 주세요.";
    if (!email.trim()) errors.email = "이메일을 입력해 주세요.";
    const passwordProblem = checkPassword(password);
    if (passwordProblem) errors.password = passwordProblem;
    else if (password !== confirmPassword)
      errors.confirmPassword = "비밀번호가 서로 달라요. 다시 확인해 주세요.";
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    setFailure(null);
    if (Object.keys(errors).length > 0) return;

    setIsLoading(true);

    try {
      const result = await signUp({ email, password, displayName });
      if (result.error) {
        setFailure(result.error);
      } else {
        setSuccess(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="rounded-lg border border-line">
        <CardHeader>
          <CardTitle className="text-2xl">메일함을 확인해 주세요</CardTitle>
          <CardDescription>
            가입 확인 메일을 보냈어요. 메일의 링크를 누르면 가입이
            끝나요.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            메일이 오지 않았나요? 스팸함도 확인해 보세요.
          </p>
          <ResendConfirmation email={email} />
        </CardContent>
        <CardFooter className="justify-center">
          <Link
            href="/auth/login"
            className="text-sm font-medium text-primary hover:underline"
          >
            로그인하러 가기
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="relative">
      <Card className="rounded-lg border border-line">
        <CardHeader>
          <CardTitle className="text-2xl">회원가입</CardTitle>
          <CardDescription>가입하면 책에 쓴 답이 계정에 남아요.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {failure && !failure.field && <FormAlert>{failure.message}</FormAlert>}
            <Input
              label="이름"
              type="text"
              placeholder="홍길동"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              error={fieldErrors.displayName}
            />
            <Input
              label="이메일"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              error={
                fieldErrors.email ??
                (failure?.field === "email" ? failure.message : undefined)
              }
            />
            {failure?.action === "login" && (
              <Link
                href="/auth/login"
                className="-mt-2 self-start text-caption font-semibold text-primary underline decoration-1 underline-offset-3"
              >
                로그인하러 가기
              </Link>
            )}
            <Input
              label="비밀번호"
              type="password"
              placeholder={PASSWORD_HINT}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              error={
                fieldErrors.password ??
                (failure?.field === "password" ? failure.message : undefined)
              }
            />
            <Input
              label="비밀번호 확인"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              error={fieldErrors.confirmPassword}
            />
            <Button type="submit" isLoading={isLoading} className="mt-2 w-full">
              회원가입
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted">
            이미 계정이 있나요?{" "}
            <Link
              href="/auth/login"
              className="font-medium text-primary hover:underline"
            >
              로그인
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
