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
  if (!res.ok) throw new Error("책 목록을 불러오지 못했습니다.");
  const json = await res.json();
  return json.data ?? [];
}

async function fetchSalesData(): Promise<SalesData> {
  const res = await fetch("/api/analytics/sales");
  if (!res.ok) throw new Error("판매 데이터를 불러오지 못했습니다.");
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

  const { data: salesData } = useQuery<SalesData>({
    queryKey: ["sales-analytics"],
    queryFn: fetchSalesData,
    enabled: !!user,
  });

  const handleDelete = async (id: string) => {
    if (!confirm("이 콘텐츠를 삭제하시겠습니까?")) return;
    await fetch(`/api/books/${id}`, { method: "DELETE" });
    refetch();
  };

  const publishedBooks = books.filter((b) => b.status === "published");
  const totalRevenue = salesData?.totalRevenue ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header row */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">크리에이터 스튜디오</h1>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/create" className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              새 콘텐츠
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">총 작품</p>
              <p className="text-2xl font-bold text-gray-900">{books.length}권</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">출판 작품</p>
              <p className="text-2xl font-bold text-gray-900">{publishedBooks.length}권</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2">
              <DollarSign className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">총 판매액</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalRevenue.toLocaleString("ko-KR")}원
              </p>
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
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
          콘텐츠 목록을 불러오지 못했습니다.{" "}
          <button onClick={() => refetch()} className="underline">
            다시 시도
          </button>
        </div>
      ) : books.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-200 bg-white py-20 text-center">
          <BookOpen className="h-16 w-16 text-gray-300" />
          <div>
            <p className="text-lg font-semibold text-gray-700">아직 콘텐츠가 없습니다</p>
            <p className="mt-1 text-sm text-gray-400">첫 번째 콘텐츠를 만들어보세요!</p>
          </div>
          <Button asChild>
            <Link href="/create">
              <PlusCircle className="h-4 w-4 mr-2" />
              첫 콘텐츠 만들기
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
