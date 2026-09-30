"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export default function PaymentFailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const errorCode = searchParams.get("code") ?? "";
  const errorMessage = searchParams.get("message") ?? "결제가 취소되었거나 실패했습니다.";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <XCircle className="mb-4 h-16 w-16 text-red-400" />
      <h1 className="text-2xl font-bold text-gray-900">결제 실패</h1>
      <p className="mt-2 text-sm text-gray-500">{errorMessage}</p>
      {errorCode && (
        <p className="mt-1 text-xs text-gray-400">에러 코드: {errorCode}</p>
      )}
      <div className="mt-6 flex gap-3">
        <Button className="rounded-full" onClick={() => router.back()}>다시 시도</Button>
        <Button variant="outline" className="rounded-full" onClick={() => router.push("/explore")}>
          둘러보기
        </Button>
      </div>
    </div>
  );
}
