"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

interface PurchasedBook {
  id: string;
  book_id: string;
  price_paid: number;
  purchased_at: string;
  books: {
    id: string;
    title: string;
    description: string | null;
    cover_image_url: string | null;
    language: string;
    total_chapters: number;
    total_words: number;
    author_name?: string | null;
  };
}

const GRADIENT_COLORS = [
  "from-blue-400 to-indigo-600",
  "from-purple-400 to-pink-600",
  "from-green-400 to-teal-600",
  "from-orange-400 to-red-600",
  "from-cyan-400 to-blue-600",
  "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-600",
  "from-emerald-400 to-green-600",
];

function getGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) & 0xffffffff;
  }
  return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
}

async function fetchPurchases(): Promise<PurchasedBook[]> {
  const res = await fetch("/api/purchases");
  if (!res.ok) throw new Error("구매 목록을 불러오지 못했습니다.");
  const json = await res.json();
  return json.data ?? [];
}

export default function LibraryPage() {
  const user = useAuthStore((s) => s.user);

  const { data: purchases = [], isLoading, isError, refetch } = useQuery<PurchasedBook[]>({
    queryKey: ["purchases"],
    queryFn: fetchPurchases,
    enabled: !!user,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">구매한 책</h1>
        <Button variant="outline" asChild>
          <Link href="/explore" className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            더 둘러보기
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
          구매 목록을 불러오지 못했습니다.{" "}
          <button onClick={() => refetch()} className="underline">
            다시 시도
          </button>
        </div>
      ) : purchases.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-200 bg-white py-20 text-center">
          <ShoppingBag className="h-16 w-16 text-gray-300" />
          <div>
            <p className="text-lg font-semibold text-gray-700">
              아직 구매한 책이 없습니다
            </p>
            <p className="mt-1 text-sm text-gray-400">
              마음에 드는 전자책을 찾아보세요!
            </p>
          </div>
          <Button asChild>
            <Link href="/explore">전자책 둘러보기</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {purchases.map((purchase) => {
            const book = purchase.books;
            if (!book) return null;
            const gradient = getGradient(book.title);

            return (
              <div
                key={purchase.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-2 hover:shadow-lg"
              >
                {/* Cover */}
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-gray-100">
                  {book.cover_image_url ? (
                    <Image
                      src={book.cover_image_url}
                      alt={book.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    />
                  ) : (
                    <div
                      className={cn(
                        "flex h-full w-full items-center justify-center bg-gradient-to-br",
                        gradient,
                      )}
                    >
                      <span className="text-5xl font-bold text-white/80 select-none">
                        {book.title.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-gray-900">
                    {book.title}
                  </h3>
                  {book.author_name && (
                    <p className="mb-2 text-xs text-gray-500">{book.author_name}</p>
                  )}
                  <p className="mt-auto text-xs text-gray-400">
                    {new Date(purchase.purchased_at).toLocaleDateString("ko-KR")} 구매
                  </p>

                  {/* Actions */}
                  <div className="mt-2 flex gap-1.5">
                    <Button size="sm" className="flex-1 text-xs" asChild>
                      <Link href={`/reader/${book.id}`}>
                        <BookOpen className="mr-1 h-3 w-3" />
                        읽기
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
