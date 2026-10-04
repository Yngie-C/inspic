"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PlusCircle, BookOpen, DollarSign, TrendingUp } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { BookCard } from "@/components/dashboard/BookCard";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Book } from "@/types";

interface SalesData {
  totalRevenue: number;
  totalSales: number;
  bookStats: {
    bookId: string;
    title: string;
    price: number;
    sales: number;
    revenue: number;
  }[];
}

async function fetchBooks(): Promise<Book[]> {
  const res = await fetch("/api/books");
  if (!res.ok) throw new Error("책 목록을 불러오지 못했어요.");
  const json = await res.json();
  return json.data ?? [];
}

async function fetchSalesData(): Promise<SalesData> {
  const res = await fetch("/api/analytics/sales");
  if (!res.ok) throw new Error("판매 현황을 불러오지 못했어요.");
  const json = await res.json();
  return json.data;
}

export default function CreatorPage() {
  const user = useAuthStore((s) => s.user);

  const {
    data: books = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Book[]>({
    queryKey: ["books"],
    queryFn: fetchBooks,
    enabled: !!user,
  });

  const { data: salesData, isError: salesError } = useQuery<SalesData>({
    queryKey: ["sales-analytics"],
    queryFn: fetchSalesData,
    enabled: !!user,
  });

  const handleDelete = async (id: string) => {
    if (!confirm("이 책을 삭제할까요? 장과 독자의 답까지 모두 지워지고 되돌릴 수 없어요.")) return;
    const res = await fetch(`/api/books/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      // 판매된 책은 서버가 삭제를 거절하고(HAS_SALES) 비공개 전환을
      // 안내합니다. 그 문구만 그대로 보여 주고 나머지는 일반 문구로.
      const json = await res?.json().catch(() => null);
      alert(
        json?.code === "HAS_SALES"
          ? json.error
          : "책을 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      );
    }
    refetch();
  };

  const publishedBooks = books.filter((b) => b.status === "published");
  // 불러오지 못했을 때 0원으로 그리면 판매가 있는 저자에게 실제 매출처럼
  // 보입니다(코드 리뷰 7-P1-1). 값이 없으면 "—"입니다.
  const totalRevenue = salesData?.totalRevenue;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header row */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">크리에이터 스튜디오</h1>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/create" className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              새 책
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2">
              <BookOpen className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-sm text-muted">전체</p>
              <p className="text-2xl font-bold text-primary">{books.length}권</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted">공개 중</p>
              <p className="text-2xl font-bold text-primary">{publishedBooks.length}권</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-6 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2">
              <DollarSign className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted">총 판매액</p>
              <p className="text-2xl font-bold text-primary">
                {totalRevenue === undefined
                  ? "—"
                  : `${totalRevenue.toLocaleString("ko-KR")}원`}
              </p>
              {salesError && (
                <p className="text-caption text-muted">불러오지 못했어요</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Book grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-danger/40 p-8 text-center text-danger">
          책 목록을 불러오지 못했어요.{" "}
          <button onClick={() => refetch()} className="underline">
            다시 시도
          </button>
        </div>
      ) : books.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-line bg-surface py-20 text-center">
          <BookOpen className="h-16 w-16 text-faint" />
          <div>
            <p className="text-lg font-semibold text-primary">아직 만든 책이 없어요</p>
            <p className="mt-1 text-sm text-muted">원고가 있다면 파일을 올려서 바로 시작할 수 있어요.</p>
          </div>
          <Button asChild>
            <Link href="/create">
              <PlusCircle className="h-4 w-4 mr-2" />
              첫 책 만들기
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {books.map((book) => (
            <BookCard key={book.id} book={book} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
