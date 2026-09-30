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
    <div className={cn("space-y-3", className)}>
      {/* Search input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={localQuery}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="제목이나 설명으로 검색..."
            className="h-10 w-full rounded-full border border-gray-300 bg-white pl-10 pr-10 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
          />
          {localQuery && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            "flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
            showFilters
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">필터</span>
        </button>
      </div>

      {/* Filter row */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-white p-3">
          {/* Sort filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">정렬</span>
            <div className="flex gap-1">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSortChange(opt.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    filters.sort === opt.value
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-auto w-px bg-gray-200 hidden sm:block" />

          {/* Price filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">가격</span>
            <div className="flex gap-1">
              {PRICE_RANGES.map((range) => (
                <button
                  key={range.value}
                  onClick={() => handlePriceRangeChange(range.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    filters.priceRange === range.value
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
