"use client";

import Link from "next/link";
import { BookCover } from "@/components/ui/book-cover";
import { cn } from "@/lib/utils";
import type { Book } from "@/types";

interface BookWithAuthor extends Book {
  author_name?: string | null;
}

interface BookPreviewCardProps {
  book: BookWithAuthor;
  className?: string;
}

export function BookPreviewCard({ book, className }: BookPreviewCardProps) {
  const href = `/book/${book.id}`;

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col overflow-hidden transition-all duration-300",
        "hover:-translate-y-2",
        className,
      )}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-gray-100 bg-gray-100 shadow-sm">
        <BookCover
          bookId={book.id}
          title={book.title}
          coverImageUrl={book.cover_image_url}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          size="md"
        />
        {/* [SUN-68] 시리즈 기능 — 추후 활성화 */}
        {/* {seriesStatusInfo && (
          <div
            className={cn(
              "absolute left-3 top-3 rounded-md px-2 py-1 text-[10px] font-bold backdrop-blur",
              seriesStatusInfo.className,
            )}
          >
            {seriesStatusInfo.label}
          </div>
        )} */}
        {/* 무료 뱃지만 노출 */}
        {(!book.price || book.price === 0) && (
          <div className="absolute right-3 top-3 rounded-xs border border-line bg-surface px-2 py-1 text-label text-accent">
            FREE
          </div>
        )}
      </div>

      <div className="mt-4 px-1">
        <h3 className="line-clamp-1 text-base font-bold text-gray-900 decoration-1 underline-offset-3 group-hover:underline">
          {book.title}
        </h3>
        <p className="mt-1 text-sm text-gray-400">
          {book.author_name || "Author"}
        </p>
      </div>
    </Link>
  );
}
