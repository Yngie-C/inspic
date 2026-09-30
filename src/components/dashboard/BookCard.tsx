"use client";

import Link from "next/link";
import { Edit3, Trash2 } from "lucide-react";
import { BookCover } from "@/components/ui/book-cover";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Book } from "@/types";

interface BookCardProps {
  book: Book;
  onDelete?: (id: string) => void;
}

const statusLabel: Record<string, string> = {
  draft: "초안",
  processing: "처리 중",
  published: "출판됨",
  archived: "보관됨",
};

// 상태는 면색 배지가 아니라 텍스트로 쓴다. 발행된 것만 accent다.
const statusStyle: Record<string, string> = {
  draft: "text-muted",
  processing: "text-warning",
  published: "font-semibold text-accent",
  archived: "text-muted",
};

export function BookCard({ book, onDelete }: BookCardProps) {
  const readingTime = Math.max(1, Math.ceil(book.total_words / 200));

  return (
    <div className="flex flex-col gap-2.5">
      {/* Cover */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sm border border-primary/10">
        <BookCover
          bookId={book.id}
          title={book.title}
          coverImageUrl={book.cover_image_url}
          sizes="(max-width: 640px) 50vw, 25vw"
          size="md"
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-1.5">
        <p className={cn("text-caption", statusStyle[book.status])}>
          {statusLabel[book.status] ?? book.status}
        </p>
        <h3 className="line-clamp-2 text-subtitle text-primary">
          {book.title}
        </h3>
        {book.description && (
          <p className="line-clamp-2 text-caption text-muted">{book.description}</p>
        )}

        {/* Stats */}
        <p className="mt-auto text-caption tabular-nums text-muted">
          {book.total_chapters}장 · 약 {readingTime}분 ·{" "}
          {book.total_words.toLocaleString()}자
        </p>

        {/* Actions */}
        <div className="mt-2 flex gap-2">
          {book.status === "published" && (
            <Button variant="default" size="sm" className="flex-1" asChild>
              <Link href={`/reader/${book.id}`}>읽기</Link>
            </Button>
          )}
          <Button variant="secondary" size="sm" className="flex-1" asChild>
            <Link href={`/create/edit/${book.id}`}>
              <Edit3 className="h-4 w-4" strokeWidth={1.75} />
              편집
            </Link>
          </Button>
          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              aria-label="삭제"
              onClick={() => onDelete(book.id)}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
