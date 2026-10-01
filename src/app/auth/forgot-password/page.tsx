"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthFailure } from "@/lib/auth-errors";
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

export default function ForgotPasswordPage() {
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);

  const [email, setEmail] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFailure(null);
    setIsLoading(true);

    try {
      const result = await requestPasswordReset(email.trim());
      if (result.error) {
        setFailure(result.error);
      } else {
        setSent(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 가입하지 않은 이메일이어도 Supabase는 성공을 돌려줍니다. 화면도 같게 둡니다.
  if (sent) {
    return (
      <Card className="rounded-lg border border-line">
        <CardHeader>
          <CardTitle className="text-2xl">메일함을 확인해 주세요</CardTitle>
          <CardDescription>
            재설정 메일을 보냈어요. 메일의 링크를 눌러 새 비밀번호를 정해
            주세요. 링크는 이 브라우저에서 열어야 해요.
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
    <Card className="rounded-lg border border-line">
      <CardHeader>
        <CardTitle className="text-2xl">비밀번호 찾기</CardTitle>
        <CardDescription>
          가입한 이메일을 입력하면 비밀번호를 다시 정할 수 있는 링크를 보내요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {failure && !failure.field && <FormAlert>{failure.message}</FormAlert>}
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
          <Button type="submit" isLoading={isLoading} className="mt-2 w-full">
            재설정 메일 받기
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
