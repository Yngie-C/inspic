"use client";

import Image from "next/image";
import { useDesignVariants, type CoverVariant } from "@/components/ui/design-variants";
import { cn } from "@/lib/utils";

// DESIGN.md Components > 책 표지 플레이스홀더. 단색 면 3종 중 하나를 책 id 해시로 고른다.
const COVER_TONES: Record<CoverVariant, readonly string[]> = {
  current: [
    "bg-accent text-chiffon",
    "bg-primary text-botticelli",
    "bg-botticelli text-accent",
  ],
  // 비교용(단계 5, 임시): 로즈우드 면을 빼고 chiffon 면을 넣는다.
  "no-rosewood": [
    "bg-chiffon text-primary",
    "bg-primary text-botticelli",
    "bg-botticelli text-accent",
  ],
  // 비교용(단계 5, 임시): 짙은 면 없이 옅은 면만 쓴다.
  light: [
    "bg-chiffon text-accent",
    "bg-mark text-primary",
    "bg-botticelli text-primary",
  ],
};

const TITLE_SIZE = {
  sm: "text-body-sm",
  md: "text-subtitle",
  lg: "text-title",
} as const;

export function getCoverTone(
  bookId: string,
  variant: CoverVariant = "current",
): string {
  let hash = 0;
  for (let i = 0; i < bookId.length; i++) {
    hash = (hash * 31 + bookId.charCodeAt(i)) | 0;
  }
  const tones = COVER_TONES[variant];
  return tones[Math.abs(hash) % tones.length];
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
  const { cover } = useDesignVariants();
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
        getCoverTone(bookId, cover),
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
