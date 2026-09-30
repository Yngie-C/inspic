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
        if (!res.ok) throw new Error("책 정보를 불러올 수 없습니다.");
        const json = await res.json();
        const bookData = json.data.book;

        if (bookData.price === 0) {
          router.push(`/book/${bookId}`);
          return;
        }

        // 이미 구매했는지 확인
        const accessRes = await fetch(`/api/books/${bookId}/access`);
        const accessJson = await accessRes.json();
        if (accessJson.data.hasAccess) {
          router.push(`/book/${bookId}`);
          return;
        }

        setBook(bookData);
      } catch {
        setError("책 정보를 불러오는 중 오류가 발생했습니다.");
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

      if (!reqRes.ok) {
        const errJson = await reqRes.json();
        throw new Error(errJson.error || "결제 요청 생성에 실패했습니다.");
      }

      const { data } = await reqRes.json();

      // 2. Toss SDK 로드 및 결제 위젯 호출
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const payment = tossPayments.payment({ customerKey: user.id });

      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: data.amount },
        orderId: data.orderId,
        orderName: data.orderName,
        successUrl: `${window.location.origin}/payments/success`,
        failUrl: `${window.location.origin}/payments/fail`,
      });
    } catch (err) {
      if (err instanceof Error && err.message !== "USER_CANCEL") {
        setError(err.message);
      }
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
        <p className="text-lg font-medium text-gray-700">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.back()}>
          돌아가기
        </Button>
      </div>
    );
  }

  if (!book) return null;

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-gray-900">결제하기</h1>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* 책 정보 */}
        <div className="mb-6 border-b border-gray-100 pb-6">
          <h2 className="text-lg font-semibold text-gray-900">{book.title}</h2>
          {book.author_name && (
            <p className="mt-1 text-sm text-gray-500">by {book.author_name}</p>
          )}
        </div>

        {/* 결제 금액 */}
        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">결제 금액</span>
          <span className="text-2xl font-bold text-gray-900">
            {book.price.toLocaleString("ko-KR")}원
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 환불 정책 안내 */}
        <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <p className="mb-1">
            디지털 콘텐츠 특성상 콘텐츠 열람 후에는 환불이 제한됩니다.
          </p>
          <p className="text-xs text-gray-400">
            자세한 내용은{" "}
            <Link href="/terms" className="underline hover:text-gray-600">이용약관</Link>
            {" "}및{" "}
            <Link href="/privacy" className="underline hover:text-gray-600">개인정보처리방침</Link>
            을 확인해 주세요.
          </p>
        </div>

        {/* 동의 체크박스 */}
        <label className="mb-4 flex cursor-pointer items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-gray-900"
          />
          <span>
            위 내용을 확인하였으며, 이용약관 및 개인정보처리방침에 동의합니다.
          </span>
        </label>

        {/* 결제 버튼 */}
        <Button
          onClick={handlePayment}
          isLoading={paying}
          disabled={paying || !agreed}
          size="lg"
          className="w-full rounded-full bg-accent hover:bg-accent-hover text-on-accent"
        >
          {book.price.toLocaleString("ko-KR")}원 결제하기
        </Button>

        <p className="mt-4 text-center text-xs text-gray-400">
          Toss Payments를 통해 안전하게 결제됩니다
        </p>
      </div>
    </div>
  );
}
