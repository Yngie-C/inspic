"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
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

export default function SignupPage() {
  const signUp = useAuthStore((s) => s.signUp);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const validate = (): string => {
    if (!displayName.trim()) return "이름을 입력해 주세요.";
    if (!email.trim()) return "이메일을 입력해 주세요.";
    if (password.length < 6) return "비밀번호는 6자 이상이어야 해요.";
    if (password !== confirmPassword) return "비밀번호가 서로 달라요. 다시 확인해 주세요.";
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const result = await signUp({ email, password, displayName });
      if (result.error) {
        setError(result.error);
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
            {error && (
              <div className="rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}
            <Input
              label="이름"
              type="text"
              placeholder="홍길동"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
            <Input
              label="이메일"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              label="비밀번호"
              type="password"
              placeholder="6자 이상"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <Input
              label="비밀번호 확인"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
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
