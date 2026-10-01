"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookGrid } from "@/components/explore/BookGrid";
import { BookPreviewCard } from "@/components/explore/BookPreviewCard";
import { Button } from "@/components/ui/button";
import { SearchBar, type SearchFilters } from "@/components/explore/SearchBar";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
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
  if (!res.ok) throw new Error("책 목록을 불러오지 못했어요.");
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

/**
 * 책이 이보다 적으면 인기 줄을 숨긴다. 인기 6권이 전체 목록과 거의 겹쳐
 * 같은 표지를 두 번 보게 된다. 데스크톱 그리드 세 줄(4열 × 3)이 기준이다.
 */
const POPULAR_MIN_TOTAL = 12;

function PopularBooksSection() {
  const { data: books, isLoading } = useQuery({
    queryKey: ["explore-popular"],
    queryFn: fetchPopularBooks,
    staleTime: 60_000,
  });

  // 로딩 중에는 자리를 비워 둔다. 반짝이는 뼈대(shimmer)는 쓰지 않는다.
  if (isLoading || !books || books.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="mb-3.5 text-label text-muted">많이 읽는 책</h2>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 min-[901px]:mx-0 min-[901px]:grid min-[901px]:grid-cols-6 min-[901px]:overflow-visible min-[901px]:px-0 min-[901px]:[&>:nth-child(n+7)]:hidden">
        {books.map((book) => (
          <BookPreviewCard
            key={book.id}
            book={book}
            size="sm"
            className="w-36 flex-none min-[901px]:w-auto"
          />
        ))}
      </div>
    </section>
  );
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24 text-muted">
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
    <div className="mx-auto max-w-[936px] px-4 pb-16 pt-10 min-[601px]:px-6 min-[601px]:pt-12">
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="text-display text-primary max-[600px]:text-[25px]">탐색</h1>
        <p className="text-body-sm text-muted">
          필요한 주제를 골라 짧게 읽어 보세요.
        </p>
      </div>

      <div className="mb-10">
        <SearchBar filters={filters} onFiltersChange={handleFiltersChange} />
      </div>

      {/* 찾는 중에는 결과가 바로 이어지도록 인기 줄을 숨긴다. 책이 적을 때도 숨긴다. */}
      {!filters.query && !filters.priceRange && !isLoading && total > POPULAR_MIN_TOTAL && (
        <PopularBooksSection />
      )}

      {!isLoading && !isError && total > 0 && (
        <h2 className="mb-3.5 flex items-baseline gap-2">
          <span className="text-label text-muted">전체</span>
          <span className="text-caption tabular-nums text-muted">
            {total.toLocaleString()}권
          </span>
        </h2>
      )}

      {isLoading ? (
        <div className="flex justify-center py-24 text-muted">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-1 py-24 text-center">
          <p className="text-subtitle text-danger">책 목록을 불러오지 못했어요</p>
          <p className="text-body-sm text-muted">
            연결을 확인하고 페이지를 새로고침해 주세요.
          </p>
        </div>
      ) : (
        <BookGrid books={books} />
      )}

      {totalPages > 1 && (
        <nav
          aria-label="페이지"
          className="mt-12 flex items-center justify-center gap-2"
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            이전
          </Button>

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
              const current = pageNum === page;
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setPage(pageNum)}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "h-8 min-w-8 rounded-sm px-2 text-body-sm tabular-nums transition-colors duration-150 ease-out",
                    current ? "bg-mark font-semibold" : "text-muted hover:bg-mark",
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            다음
          </Button>
        </nav>
      )}
    </div>
  );
}
