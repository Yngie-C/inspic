"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import { safeInternalPath } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /**
   * 로그인 후 돌아갈 곳. 리더처럼 로그인이 필요한 화면이 `?redirect=`로
   * 넘겨 줍니다. `useSearchParams()` 대신 여기서 읽는 것은 Suspense
   * 경계를 강제하지 않기 위해서이고, 값은 제출 시점에만 필요합니다.
   */
  const redirectTarget = () =>
    safeInternalPath(
      new URLSearchParams(window.location.search).get("redirect"),
      "/dashboard",
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await signIn(email, password);
      if (result.error) {
        setError(result.error);
      } else {
        router.push(redirectTarget());
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <div className="absolute top-1/4 -left-20 h-60 w-60 rounded-full bg-brand-100 opacity-40 blur-3xl" />
      <div className="absolute bottom-1/4 -right-20 h-60 w-60 rounded-full bg-brand-200 opacity-30 blur-3xl" />
      <Card className="rounded-2xl border border-gray-100 shadow-sm">
        <CardHeader>
          <CardTitle className="font-logo text-2xl">로그인</CardTitle>
          <CardDescription>inspic 계정으로 로그인하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
                {error}
              </div>
            )}
            <Input
              label="이메일"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="rounded-full"
            />
            <Input
              label="비밀번호"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="rounded-full"
            />
            <Button type="submit" isLoading={isLoading} className="w-full mt-2 rounded-full">
              로그인
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-gray-500">
            계정이 없으신가요?{" "}
            <Link href="/auth/signup" className="font-medium text-gray-900 hover:underline">
              회원가입
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
