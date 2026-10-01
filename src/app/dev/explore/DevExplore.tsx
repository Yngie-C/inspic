"use client";

import { useState } from "react";
import { BookGrid } from "@/components/explore/BookGrid";
import { BookPreviewCard } from "@/components/explore/BookPreviewCard";
import { SearchBar, type SearchFilters } from "@/components/explore/SearchBar";
import { DEV_BOOKS } from "../_mock/book";

/** `app/explore/page.tsx`와 같은 배치를 목 데이터로 그린다. */
export function DevExplore({ showPopular = false }: { showPopular?: boolean }) {
  const [filters, setFilters] = useState<SearchFilters>({
    query: "",
    sort: "newest",
    priceRange: "",
  });

  return (
    <div className="mx-auto max-w-[936px] px-4 pb-16 pt-10 min-[601px]:px-6 min-[601px]:pt-12">
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="text-display text-primary max-[600px]:text-[25px]">탐색</h1>
        <p className="text-body-sm text-muted">
          읽고, 쓰고, 적용하는 워크북을 찾아보세요.
        </p>
      </div>
      <div className="mb-10">
        <SearchBar filters={filters} onFiltersChange={setFilters} />
      </div>
      {/* 실제 탐색과 같은 규칙: 12권 이하면 인기 줄을 숨긴다(app/explore/page.tsx POPULAR_MIN_TOTAL). ?popular로 강제 표시. */}
      {(showPopular || DEV_BOOKS.length > 12) && (
        <section className="mb-12">
          <h2 className="mb-3.5 text-label text-muted">많이 읽는 책</h2>
          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 min-[901px]:mx-0 min-[901px]:grid min-[901px]:grid-cols-6 min-[901px]:overflow-visible min-[901px]:px-0 min-[901px]:[&>:nth-child(n+7)]:hidden">
            {DEV_BOOKS.map((book) => (
              <BookPreviewCard key={book.id} book={book} size="sm" className="w-36 flex-none min-[901px]:w-auto" />
            ))}
          </div>
        </section>
      )}
      <h2 className="mb-3.5 flex items-baseline gap-2">
        <span className="text-label text-muted">전체</span>
        <span className="text-caption tabular-nums text-muted">{DEV_BOOKS.length}권</span>
      </h2>
      <BookGrid books={DEV_BOOKS} />
      <div className="mt-16">
        <BookGrid books={[]} />
      </div>
    </div>
  );
}
