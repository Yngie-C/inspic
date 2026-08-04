"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { Book } from "@/types";

interface BookWithAuthor extends Book {
  author_name?: string | null;
}

interface BookPreviewCardProps {
  book: BookWithAuthor;
  className?: string;
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

export function BookPreviewCard({ book, className }: BookPreviewCardProps) {
  const gradient = getGradient(book.title);
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
        {book.cover_image_url ? (
          <Image
            src={book.cover_image_url}
            alt={book.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center bg-gradient-to-br",
              gradient,
            )}
          >
            <span className="text-5xl font-bold text-white/50 select-none">
              {book.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
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
          <div className="absolute right-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold text-brand-600 backdrop-blur">
            FREE
          </div>
        )}
      </div>

      <div className="mt-4 px-1">
        <h3 className="line-clamp-1 text-base font-bold text-gray-900 transition-colors group-hover:text-brand-600">
          {book.title}
        </h3>
        <p className="mt-1 text-sm text-gray-400">
          {book.author_name || "Author"}
        </p>
      </div>
    </Link>
  );
}
