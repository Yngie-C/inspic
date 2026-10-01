import Image from "next/image";
import { cn } from "@/lib/utils";

// DESIGN.md Components > 책 표지 플레이스홀더. 옅은 단색 면 3종 중 하나를 책 id 해시로 고른다.
// paper와 대비가 낮아 부모 박스가 1px 테두리를 둘러야 한다.
const COVER_TONES = [
  "bg-chiffon text-accent",
  "bg-mark text-primary",
  "bg-botticelli text-primary",
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
      <span
        className={cn(
          "line-clamp-4 font-bold break-keep [text-wrap:balance]",
          TITLE_SIZE[size],
        )}
      >
        {title}
      </span>
      <span className="text-label" aria-hidden>
        INSPIC
      </span>
    </div>
  );
}
