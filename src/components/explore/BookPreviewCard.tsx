import Link from "next/link";
import { BookCover } from "@/components/ui/book-cover";
import { cn } from "@/lib/utils";
import type { Book } from "@/types";

export interface BookWithAuthor extends Book {
  author_name?: string | null;
}

interface BookPreviewCardProps {
  book: BookWithAuthor;
  /** sm은 가로 스크롤 줄처럼 좁은 자리용. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * 탐색 카드 (DESIGN.md "탐색 카드"): 표지, 제목, 메타 순서다.
 * 카드 면·테두리·hover 이동은 없고, hover 시 제목에 밑줄만 생긴다.
 */
export function BookPreviewCard({
  book,
  size = "md",
  className,
}: BookPreviewCardProps) {
  const price = book.price > 0 ? `${book.price.toLocaleString("ko-KR")}원` : "무료";
  const meta = [book.author_name, price].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/book/${book.id}`}
      className={cn("group flex flex-col gap-2.5 text-primary", className)}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sm border border-primary/10">
        <BookCover
          bookId={book.id}
          title={book.title}
          coverImageUrl={book.cover_image_url}
          sizes={
            size === "sm"
              ? "144px"
              : "(max-width: 600px) 50vw, (max-width: 1024px) 33vw, 280px"
          }
          size={size}
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <h3
          className={cn(
            "line-clamp-2 text-balance decoration-1 underline-offset-3 group-hover:underline",
            size === "sm" ? "text-body-sm font-semibold" : "text-subtitle",
          )}
        >
          {book.title}
        </h3>
        <p className="truncate text-caption text-muted">{meta}</p>
      </div>
    </Link>
  );
}
