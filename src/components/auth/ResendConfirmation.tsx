"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthFailure } from "@/lib/auth-errors";

/**
 * 가입 확인 메일을 다시 보내는 버튼. 로그인 화면의 "인증 전" 안내와
 * 가입 완료 화면이 함께 씁니다. 결과는 버튼 자리에 문장으로 남깁니다.
 */
export function ResendConfirmation({
  email,
  label = "인증 메일 다시 보내기",
}: {
  email: string;
  label?: string;
}) {
  const resendConfirmation = useAuthStore((s) => s.resendConfirmation);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [needsEmail, setNeedsEmail] = useState(false);

  const handleClick = async () => {
    if (!email.trim()) {
      setNeedsEmail(true);
      return;
    }
    setNeedsEmail(false);
    setFailure(null);
    setStatus("sending");
    const result = await resendConfirmation(email.trim());
    if (result.error) {
      setFailure(result.error);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  };

  if (status === "sent") {
    return (
      <p role="status" className="text-sm text-success">
        인증 메일을 다시 보냈어요. 메일함을 확인해 주세요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "sending"}
        className="self-start text-sm font-semibold text-primary underline decoration-1 underline-offset-3 disabled:text-faint"
      >
        {status === "sending" ? "보내는 중" : label}
      </button>
      {needsEmail && (
        <p className="text-caption text-danger">
          이메일을 입력한 뒤 다시 눌러 주세요.
        </p>
      )}
      {failure && <p className="text-caption text-danger">{failure.message}</p>}
    </div>
  );
}
