"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortOrder = "newest" | "popular" | "title" | "price_asc" | "price_desc";

export interface SearchFilters {
  query: string;
  sort: SortOrder;
  priceRange: string;
}

interface SearchBarProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  className?: string;
}

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "최신순" },
  { value: "popular", label: "인기순" },
  { value: "title", label: "제목순" },
  { value: "price_asc", label: "가격 낮은순" },
  { value: "price_desc", label: "가격 높은순" },
];

const PRICE_RANGES = [
  { value: "", label: "전체" },
  { value: "free", label: "무료" },
  { value: "0-5000", label: "~5,000원" },
  { value: "5000-10000", label: "~10,000원" },
  { value: "10000+", label: "10,000원~" },
];

export function SearchBar({ filters, onFiltersChange, className }: SearchBarProps) {
  const [localQuery, setLocalQuery] = useState(filters.query);
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalQuery(filters.query);
  }, [filters.query]);

  const handleQueryChange = (value: string) => {
    setLocalQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, query: value });
    }, 300);
  };

  const handleClear = () => {
    setLocalQuery("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onFiltersChange({ ...filters, query: "" });
  };

  const handleSortChange = (sort: SortOrder) => {
    onFiltersChange({ ...filters, sort });
  };

  const handlePriceRangeChange = (priceRange: string) => {
    onFiltersChange({ ...filters, priceRange });
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            strokeWidth={1.75}
          />
          <input
            type="search"
            value={localQuery}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="제목이나 설명으로 검색"
            aria-label="책 검색"
            className="h-10 w-full rounded-md border border-field-line bg-field pl-9 pr-9 text-body text-primary placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {localQuery && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="검색어 지우기"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted transition-colors duration-150 ease-out hover:text-primary"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className={cn(
            "flex h-10 items-center gap-2 rounded-md border bg-surface px-3 text-button text-primary transition-colors duration-150 ease-out",
            showFilters ? "border-primary" : "border-line hover:border-primary",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />
          <span className="max-[600px]:sr-only">필터</span>
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-col gap-2 border-y border-line py-3">
          <FilterRow
            label="정렬"
            options={SORT_OPTIONS}
            value={filters.sort}
            onChange={(v) => handleSortChange(v as SortOrder)}
          />
          <FilterRow
            label="가격"
            options={PRICE_RANGES}
            value={filters.priceRange}
            onChange={handlePriceRangeChange}
          />
        </div>
      )}
    </div>
  );
}

/** 선택지 줄. 선택된 항목은 목차의 현재 장과 같은 mark 면 + 600이다. */
function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-8 flex-none text-caption text-muted">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-sm px-2 py-1 text-body-sm transition-colors duration-150 ease-out",
                selected ? "bg-mark font-semibold text-primary" : "text-muted hover:bg-mark",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
