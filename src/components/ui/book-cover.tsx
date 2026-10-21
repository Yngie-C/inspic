import Image from "next/image";
import { cn } from "@/lib/utils";
import { isStorageImageUrl } from "@/lib/storage-image";
import { SERVICE_NAME } from "@/lib/brand";

// DESIGN.md Components > 책 표지 플레이스홀더. 옅은 면 4종 중 하나를 책 id 해시로 고른다.
// paper와 대비가 낮아 부모 박스가 1px 테두리를 둘러야 한다.
const COVER_TONES = [
  "bg-mark text-primary",
  "bg-cover-sand text-primary",
  "bg-cover-clay text-primary",
  "bg-cover-sage text-primary",
] as const;

const TITLE_SIZE = {
  sm: "text-body-sm",
  md: "text-subtitle",
  lg: "text-title",
} as const;

export function getCoverTone(bookId: string): string {
  let hash = 0;
  for (let i = 0; i < bookId.length; i++) {
    hash = (hash * 31 + bookId.charCodeAt(i)) | 0;
  }
  return COVER_TONES[Math.abs(hash) % COVER_TONES.length];
}

interface BookCoverProps {
  bookId: string;
  title: string;
  coverImageUrl?: string | null;
  /** 플레이스홀더 하단에 둔다. `size="sm"`에서는 그리지 않는다 */
  authorName?: string | null;
  /** next/image `sizes`. 표지 이미지가 있을 때만 쓴다 */
  sizes: string;
  /** 플레이스홀더 제목 크기 */
  size?: keyof typeof TITLE_SIZE;
  priority?: boolean;
  className?: string;
}

/** 부모 박스(relative, 크기 지정)를 가득 채운다. */
export function BookCover({
  bookId,
  title,
  coverImageUrl,
  authorName,
  sizes,
  size = "md",
  priority,
  className,
}: BookCoverProps) {
  if (coverImageUrl) {
    return (
      <Image
        src={coverImageUrl}
        alt={title}
        fill
        className={cn("object-cover", className)}
        sizes={sizes}
        priority={priority}
        unoptimized={!isStorageImageUrl(coverImageUrl)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full select-none flex-col justify-between p-[12%]",
        getCoverTone(bookId),
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <span className="block w-1/3 border-t border-primary" aria-hidden />
        <span
          className={cn(
            "line-clamp-4 font-bold break-keep [text-wrap:balance]",
            TITLE_SIZE[size],
          )}
        >
          {title}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {authorName && size !== "sm" && (
          <span className="truncate text-caption" aria-hidden>
            {authorName}
          </span>
        )}
        <span className="text-label" aria-hidden>
          {SERVICE_NAME.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
