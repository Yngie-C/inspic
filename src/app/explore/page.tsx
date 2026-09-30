"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { BookCover } from "@/components/ui/book-cover";
import { BookGrid } from "@/components/explore/BookGrid";
import { SearchBar, type SearchFilters } from "@/components/explore/SearchBar";
import { Spinner } from "@/components/ui/spinner";
// [SUN-68] 시리즈 기능 — 추후 활성화 (cn은 필터 탭에서만 사용됨)
// import { cn } from "@/lib/utils";
import type { Book } from "@/types";

interface BookWithAuthor extends Book {
  author_name?: string | null;
  owner_id: string;
}

interface ExploreApiResponse {
  data: {
    books: BookWithAuthor[];
    total: number;
    page: number;
    per_page: number;
  };
}

async function fetchPublicBooks(
  filters: SearchFilters,
  page: number,
): Promise<{ books: BookWithAuthor[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  params.set("sort", filters.sort);
  if (filters.priceRange) params.set("priceRange", filters.priceRange);
  params.set("page", String(page));
  params.set("per_page", "24");

  const res = await fetch(`/api/explore?${params.toString()}`);
  if (!res.ok) throw new Error("탐색 데이터를 불러오지 못했습니다.");
  const json: ExploreApiResponse = await res.json();
  return {
    books: json.data.books ?? [],
    total: json.data.total ?? 0,
  };
}

async function fetchPopularBooks(): Promise<BookWithAuthor[]> {
  const res = await fetch("/api/explore?sort=popular&per_page=6");
  if (!res.ok) return [];
  const json: ExploreApiResponse = await res.json();
  return json.data.books ?? [];
}

const PER_PAGE = 24;

function PopularBooksSection() {
  const { data: books, isLoading } = useQuery({
    queryKey: ["explore-popular"],
    queryFn: fetchPopularBooks,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="mb-10">
        <h2 className="mb-4 text-xl font-bold text-gray-900">인기 책</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-36 h-56 rounded-2xl bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!books || books.length === 0) return null;

  return (
    <div className="mb-10">
      <h2 className="mb-4 text-xl font-bold text-gray-900">인기 책</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {books.map((book) => {
          return (
            <Link
              key={book.id}
              href={`/book/${book.id}`}
              className="group flex-shrink-0 w-36 flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm hover:-translate-y-2 hover:shadow-lg transition-all duration-300"
            >
              <div className="relative h-48 w-full overflow-hidden">
                <BookCover
                  bookId={book.id}
                  title={book.title}
                  coverImageUrl={book.cover_image_url}
                  sizes="144px"
                  size="sm"
                />
              </div>
              <div className="p-2">
                <p className="line-clamp-2 text-xs font-medium text-gray-900 group-hover:text-gray-700">
                  {book.title}
                </p>
                {book.author_name && (
                  <Link
                    href={`/author/${book.owner_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 block text-xs text-gray-400 hover:text-gray-700 hover:underline truncate"
                  >
                    {book.author_name}
                  </Link>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Spinner size="lg" />
        </div>
      }
    >
      <ExploreContent />
    </Suspense>
  );
}

function ExploreContent() {
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<SearchFilters>(() => ({
    query: searchParams.get("q") ?? "",
    sort: (searchParams.get("sort") as SearchFilters["sort"]) ?? "newest",
    priceRange: searchParams.get("priceRange") ?? "",
  }));
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["explore", filters, page],
    queryFn: () => fetchPublicBooks(filters, page),
    staleTime: 30_000,
  });

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const books = data?.books ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          콘텐츠 탐색
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          다양한 콘텐츠를 발견하고 읽어보세요
        </p>
      </div>

      {/* Popular books */}
      <PopularBooksSection />

      {/* Search & filters */}
      <div className="mb-8">
        <SearchBar filters={filters} onFiltersChange={handleFiltersChange} />
      </div>

      {/* Results count */}
      {!isLoading && !isError && (
        <div className="mb-4 text-sm text-gray-500">
          {total > 0 ? `${total.toLocaleString()}개의 콘텐츠` : ""}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-24">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-medium text-gray-700">
            데이터를 불러오는 중 오류가 발생했습니다
          </p>
          <p className="mt-1 text-sm text-gray-400">잠시 후 다시 시도해주세요.</p>
        </div>
      ) : (
        <BookGrid books={books} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40"
          >
            이전
          </button>

          <div className="flex gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`h-9 w-9 rounded-full text-sm font-medium transition-colors ${
                    pageNum === page
                      ? "bg-accent text-on-accent"
                      : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
