"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/stores/auth-store";

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!;

interface BookInfo {
  id: string;
  title: string;
  price: number;
  cover_image_url: string | null;
  author_name?: string | null;
}

function isUserCancel(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "USER_CANCEL"
  );
}

export default function CheckoutPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [book, setBook] = useState<BookInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!user) {
      // 로그인 뒤 결제 화면으로 돌아와야 합니다. 홈으로 떨어뜨리면
      // 사려던 책을 다시 찾아 들어와야 합니다.
      router.push(`/auth/login?redirect=/payments/checkout/${bookId}`);
      return;
    }

    async function loadBook() {
      try {
        const res = await fetch(`/api/books/${bookId}/detail`);
        if (!res.ok) throw new Error("책 정보를 불러오지 못했어요.");
        const json = await res.json();
        const bookData = json.data.book;

        if (bookData.price === 0) {
          router.push(`/book/${bookId}`);
          return;
        }

        // 이미 구매했는지 확인
        const accessRes = await fetch(`/api/books/${bookId}/access`);
        if (!accessRes.ok) throw new Error("구매 여부를 확인하지 못했어요.");
        const accessJson = await accessRes.json();
        if (accessJson.data.hasAccess) {
          router.push(`/book/${bookId}`);
          return;
        }

        setBook(bookData);
      } catch {
        setError("책 정보를 불러오지 못했어요. 페이지를 새로고침해 주세요.");
      } finally {
        setLoading(false);
      }
    }

    loadBook();
  }, [bookId, user, router]);

  const handlePayment = async () => {
    if (!book || !user) return;
    setPaying(true);
    setError("");

    try {
      // 1. 결제 요청 생성
      const reqRes = await fetch("/api/payments/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id }),
      });

      // 게이트웨이 오류처럼 JSON이 아닌 응답이면 SyntaxError 문구가
      // 그대로 화면에 나갑니다.
      const reqJson = await reqRes.json().catch(() => null);
      if (!reqRes.ok || !reqJson?.data) {
        throw new Error(reqJson?.error || "결제를 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      }

      const { data } = reqJson;

      // 청구 금액은 서버가 주문을 만들 때 책 가격에서 정합니다. 화면을
      // 연 사이 가격이 바뀌었다면 독자가 본 금액과 다르므로 결제창을
      // 열지 않고 새 가격을 보여 줍니다.
      if (data.amount !== book.price) {
        setBook({ ...book, price: data.amount });
        setAgreed(false);
        throw new Error(
          `가격이 ${data.amount.toLocaleString("ko-KR")}원으로 바뀌었어요. 금액을 확인하고 다시 결제해 주세요.`,
        );
      }

      // 2. Toss SDK 로드 및 결제 위젯 호출
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const payment = tossPayments.payment({ customerKey: user.id });

      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: data.amount },
        orderId: data.orderId,
        orderName: data.orderName,
        successUrl: `${window.location.origin}/payments/success`,
        // 실패 화면의 "다시 시도"가 이 책의 결제 화면으로 돌아올 수
        // 있게 책을 실어 보냅니다. Toss는 code·message·orderId를 덧붙입니다.
        failUrl: `${window.location.origin}/payments/fail?bookId=${encodeURIComponent(book.id)}`,
      });
    } catch (err) {
      // SDK v2는 사용자가 결제창을 닫으면 code가 USER_CANCEL인 에러를
      // 던집니다. message로 판별하면 창만 닫아도 붉은 오류가 뜹니다.
      if (isUserCancel(err)) return;
      setError(err instanceof Error ? err.message : "결제를 시작하지 못했어요.");
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error && !book) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="text-lg font-medium text-primary">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.back()}>
          돌아가기
        </Button>
      </div>
    );
  }

  if (!book) return null;

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-primary">결제하기</h1>

      <div className="rounded-lg border border-line bg-surface p-6">
        {/* 책 정보 */}
        <div className="mb-6 border-b border-line pb-6">
          <h2 className="text-lg font-semibold text-primary">{book.title}</h2>
          {book.author_name && (
            <p className="mt-1 text-sm text-muted">by {book.author_name}</p>
          )}
        </div>

        {/* 결제 금액 */}
        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm font-medium text-muted">결제 금액</span>
          <span className="text-2xl font-bold text-primary">
            {book.price.toLocaleString("ko-KR")}원
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* 환불 정책 안내 */}
        <div className="mb-4 rounded-lg bg-mark px-4 py-3 text-sm text-muted">
          <p className="mb-1">
            책을 한 번이라도 열면 환불이 제한돼요. 열지 않았다면 구매 후 7일 안에 환불받을 수 있어요.
          </p>
          <p className="text-xs text-muted">
            자세한 내용은{" "}
            <Link href="/terms" className="underline hover:text-muted">이용약관</Link>
            {" "}과{" "}
            <Link href="/privacy" className="underline hover:text-muted">개인정보처리방침</Link>
            에서 확인할 수 있어요.
          </p>
        </div>

        {/* 동의 체크박스 */}
        <label className="mb-4 flex cursor-pointer items-start gap-2 text-sm text-primary">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-primary"
          />
          <span>
            위 내용을 확인했으며, 이용약관과 개인정보처리방침에 동의합니다.
          </span>
        </label>

        {/* 결제 버튼 */}
        <Button
          onClick={handlePayment}
          isLoading={paying}
          disabled={paying || !agreed}
          size="lg"
          className="w-full"
        >
          {book.price.toLocaleString("ko-KR")}원 결제하기
        </Button>

        <p className="mt-4 text-center text-xs text-muted">
          결제는 토스페이먼츠에서 진행돼요
        </p>
      </div>
    </div>
  );
}
