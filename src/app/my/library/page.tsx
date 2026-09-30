"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { BookCover } from "@/components/ui/book-cover";
import { BookOpen, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/stores/auth-store";

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
        <h1 className="text-2xl font-bold text-primary">구매한 책</h1>
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
        <div className="rounded-lg border border-danger/40 p-8 text-center text-body-sm text-danger">
          구매 목록을 불러오지 못했습니다.{" "}
          <button onClick={() => refetch()} className="underline">
            다시 시도
          </button>
        </div>
      ) : purchases.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-line py-20 text-center">
          <ShoppingBag className="h-16 w-16 text-faint" />
          <div>
            <p className="text-lg font-semibold text-primary">
              아직 구매한 책이 없습니다
            </p>
            <p className="mt-1 text-sm text-muted">
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

            return (
              <div
                key={purchase.id}
                className="flex flex-col gap-2.5"
              >
                {/* Cover */}
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sm border border-primary/10">
                  <BookCover
                    bookId={book.id}
                    title={book.title}
                    coverImageUrl={book.cover_image_url}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    size="md"
                  />
                </div>

                {/* Info */}
                <div className="flex flex-1 flex-col">
                  <h3 className="mb-0.5 line-clamp-2 text-subtitle text-primary">
                    {book.title}
                  </h3>
                  {book.author_name && (
                    <p className="mb-1 text-caption text-muted">{book.author_name}</p>
                  )}
                  <p className="mt-auto text-caption text-muted">
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
