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
  const signInWithOAuth = useAuthStore((s) => s.signInWithOAuth);

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

  const handleOAuth = async (provider: 'google' | 'kakao') => {
    setError("");
    setIsLoading(true);
    try {
      const result = await signInWithOAuth(provider, redirectTarget());
      if (result?.error) setError(result.error);
    } finally {
      setIsLoading(false);
    }
  };

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
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">또는</span></div>
          </div>
          <div className="flex flex-col gap-3">
            <Button variant="outline" onClick={() => handleOAuth('google')} disabled={isLoading} className="w-full rounded-full">
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google로 계속하기
            </Button>
            <Button variant="outline" onClick={() => handleOAuth('kakao')} disabled={isLoading} className="w-full rounded-full bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] border-[#FEE500]">
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.644 5.08 4.148 6.51L5.1 21l4.38-2.88C10.265 18.35 11.12 18.5 12 18.5c5.523 0 10-3.477 10-7.75S17.523 3 12 3z" fill="#191919"/>
              </svg>
              카카오로 계속하기
            </Button>
          </div>
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
