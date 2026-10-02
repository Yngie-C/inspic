"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

/**
 * Toss 결제창이 실패로 돌려보낸 화면.
 *
 * URL의 `message`는 띄우지 않습니다. 누구나 링크를 만들어 이 화면에
 * 아무 문구나 보여 줄 수 있기 때문입니다(로그인 화면의 `?error=`와
 * 같은 이유). 알려진 `code`만 문구로 바꾸고, 나머지는 일반 문구입니다.
 *
 * 여기로 오는 것은 결제창 단계에서 멈춘 결제입니다. 승인은 우리 서버가
 * 성공 화면에서 요청하므로, 이 화면까지 왔다면 돈은 빠져나가지 않았습니다.
 */
const FAILURE_MESSAGES: Record<string, string> = {
  PAY_PROCESS_CANCELED: "결제를 취소했어요.",
  PAY_PROCESS_ABORTED: "결제가 진행 중에 멈췄어요.",
  REJECT_CARD_COMPANY: "카드사에서 결제를 거절했어요. 카드 정보를 확인하거나 다른 카드로 시도해 주세요.",
};

const DEFAULT_MESSAGE = "결제를 끝내지 못했어요.";

/** 코드는 영문 대문자·숫자·밑줄만 보여 줍니다. */
const CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;

/** 책 ID는 UUID만 받습니다 — 링크로 다른 경로를 열게 두지 않습니다. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function PaymentFailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawCode = searchParams.get("code") ?? "";
  const errorCode = CODE_PATTERN.test(rawCode) ? rawCode : "";
  const message = FAILURE_MESSAGES[errorCode] ?? DEFAULT_MESSAGE;
  const rawBookId = searchParams.get("bookId") ?? "";
  const bookId = UUID_PATTERN.test(rawBookId) ? rawBookId : null;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <XCircle className="mb-4 h-16 w-16 text-danger" />
      <h1 className="text-2xl font-bold text-primary">결제하지 못했어요</h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <p className="mt-1 text-sm text-muted">승인 전에 멈춘 결제라 돈은 빠져나가지 않았어요.</p>
      {errorCode && (
        <p className="mt-1 text-xs text-muted">오류 코드: {errorCode}</p>
      )}
      <div className="mt-6 flex gap-3">
        {/* 모바일 리다이렉트나 새 탭에서는 뒤로 가기로 결제 화면에
            돌아가지 못합니다. 책을 알면 그 결제 화면으로 바로 보냅니다. */}
        {bookId && (
          <Button onClick={() => router.push(`/payments/checkout/${bookId}`)}>
            다시 시도
          </Button>
        )}
        <Button variant="outline" onClick={() => router.push("/explore")}>
          둘러보기
        </Button>
      </div>
    </div>
  );
}
