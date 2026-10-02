"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Info } from "lucide-react";

/**
 * 결제 승인 결과 화면.
 *
 * 서버는 네 가지로 답합니다: 열렸다(completed) · 열지 못해 되돌렸다
 * (refunded) · 아직 모른다(processing) · 실패했다. 되돌린 경우와 아직
 * 모르는 경우를 붉은 실패 화면으로 보여 주면 독자는 돈이 묶인 줄 알고
 * 다시 결제합니다. 그래서 따로 그립니다.
 *
 * refunded의 "바로 읽기"는 서버가 `bookId`를 실어 준 경우(이미 가진
 * 책이라 중복 결제를 취소한 경우)에만 뜹니다.
 */
export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<
    "confirming" | "success" | "refunded" | "processing" | "error"
  >("confirming");
  const [bookId, setBookId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const paymentKey = searchParams.get("paymentKey");
  const orderId = searchParams.get("orderId");
  const amount = searchParams.get("amount");
  const invalidParams = !paymentKey || !orderId || !amount;

  useEffect(() => {
    if (!paymentKey || !orderId || !amount) return;

    async function confirmPayment() {
      try {
        const res = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentKey,
            orderId,
            amount: Number(amount),
          }),
        });

        // 게이트웨이 504처럼 JSON이 아닌 응답이 올 수 있습니다. 그대로
        // res.json()을 부르면 SyntaxError 문구가 화면에 나가고, 독자는
        // 결제가 실패한 줄 알고 다시 결제합니다.
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.data) {
          setStatus("error");
          setMessage(
            json?.error ??
              "결제 결과를 확인하지 못했어요. 잠시 뒤 구매 내역에서 결제 상태를 확인해 주세요.",
          );
          return;
        }

        setBookId(json.data.bookId ?? null);

        if (json.data.status === "refunded") {
          setStatus("refunded");
          setMessage(json.data.reason ?? "결제를 자동으로 취소했어요.");
          return;
        }

        if (json.data.status === "processing") {
          setStatus("processing");
          setMessage(json.data.reason ?? "결제 결과를 아직 확인하는 중이에요.");
          return;
        }

        setStatus("success");
      } catch {
        // 요청이 서버에 닿았는지 모릅니다. 실패로 단정하지 않습니다.
        setStatus("error");
        setMessage("결제 결과를 확인하지 못했어요. 잠시 뒤 구매 내역에서 결제 상태를 확인해 주세요.");
      }
    }

    confirmPayment();
  }, [paymentKey, orderId, amount]);

  if (invalidParams) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="text-lg font-medium text-danger">결제를 끝내지 못했어요</p>
        <p className="mt-2 text-sm text-muted">
          결제 정보가 올바르지 않아요. 구매 내역에서 결제 상태를 확인해 주세요.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => router.push("/explore")}>
          책 둘러보기
        </Button>
      </div>
    );
  }

  if (status === "confirming") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-muted">결제를 확인하고 있어요</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="text-lg font-medium text-danger">결제를 끝내지 못했어요</p>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <Button variant="outline" className="mt-6" onClick={() => router.push("/explore")}>
          책 둘러보기
        </Button>
      </div>
    );
  }

  if (status === "processing") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <Info className="mb-4 h-16 w-16 text-muted" />
        <h1 className="text-2xl font-bold text-primary">결제를 확인하고 있어요</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">{message}</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          다시 결제하지 마세요. 승인되지 않았다면 결제는 자동으로 취소돼요.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => router.push("/my/library")}>
          내 서재로 가기
        </Button>
      </div>
    );
  }

  if (status === "refunded") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <Info className="mb-4 h-16 w-16 text-muted" />
        <h1 className="text-2xl font-bold text-primary">
          결제를 취소했어요
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted">{message}</p>
        <div className="mt-6 flex gap-3">
          {bookId && (
            <Button onClick={() => router.push(`/reader/${bookId}`)}>
              바로 읽기
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push("/my/library")}>
            내 서재로 가기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <CheckCircle2 className="mb-4 h-16 w-16 text-success" />
      <h1 className="text-2xl font-bold text-primary">결제했어요</h1>
      <p className="mt-2 text-sm text-muted">
        이제 이 책의 모든 장을 읽고 답을 저장할 수 있어요.
      </p>
      <div className="mt-6 flex gap-3">
        {bookId && (
          <Button onClick={() => router.push(`/reader/${bookId}`)}>
            바로 읽기
          </Button>
        )}
        <Button variant="outline" onClick={() => router.push("/my/library")}>
          내 서재로 가기
        </Button>
      </div>
    </div>
  );
}
