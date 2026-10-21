import Link from "next/link";
import { BookCover } from "@/components/ui/book-cover";
import { cn } from "@/lib/utils";
import type { Book } from "@/types";

export interface BookWithAuthor extends Book {
  author_name?: string | null;
  /** 저자 현장 이력 한 줄(`user_profiles.bio`). 메인 페이지만 싣습니다. */
  author_bio?: string | null;
}

/** 카드가 그리는 필드. 저자 페이지처럼 책 행 일부만 읽는 곳도 같은 카드를 씁니다. */
export type PreviewBook = Pick<BookWithAuthor, "id" | "title" | "cover_image_url" | "price"> &
  Partial<Pick<BookWithAuthor, "author_name" | "author_bio" | "description" | "total_chapters">>;

interface BookPreviewCardProps {
  book: PreviewBook;
  /** sm은 가로 스크롤 줄처럼 좁은 자리용. */
  size?: "sm" | "md";
  /**
   * 소개 두 줄과 장 수를 함께 싣습니다. 저자 페이지처럼 표지만으로 고르기
   * 어려운 자리용이고, 탐색 그리드는 쓰지 않습니다.
   */
  showSummary?: boolean;
  className?: string;
}

/**
 * 탐색 카드 (DESIGN.md "탐색 카드"): 표지, 제목, 메타 순서다.
 * 카드 면·테두리·hover 이동은 없고, hover 시 제목에 밑줄만 생긴다.
 */
export function BookPreviewCard({
  book,
  size = "md",
  showSummary = false,
  className,
}: BookPreviewCardProps) {
  const price = book.price > 0 ? `${book.price.toLocaleString("ko-KR")}원` : "무료";
  const chapters =
    showSummary && book.total_chapters ? `${book.total_chapters}개 장` : null;
  const meta = [book.author_name, chapters, price].filter(Boolean).join(" · ");
  const bio = size === "md" ? book.author_bio?.trim() : undefined;
  const summary = showSummary ? book.description?.trim() : undefined;

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
          authorName={book.author_name}
          sizes={
            size === "sm"
              ? "144px"
              : "(max-width: 600px) 50vw, (max-width: 900px) 33vw, 210px"
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
        {summary && (
          <p className="line-clamp-2 text-body-sm text-muted">{summary}</p>
        )}
        <p className="truncate text-caption text-muted">{meta}</p>
        {bio && <p className="truncate text-caption text-muted">{bio}</p>}
      </div>
    </Link>
  );
}
