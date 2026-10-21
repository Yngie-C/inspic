import Image from "next/image";
import { cn } from "@/lib/utils";
import { isStorageImageUrl } from "@/lib/storage-image";

// 사진이 없으면 이름 첫 글자를 책 표지 플레이스홀더와 같은 Stone 면에 둔다.
const SIZE = {
  sm: { box: "h-10 w-10", text: "text-body-sm font-semibold", px: "40px" },
  md: { box: "h-16 w-16", text: "text-subtitle", px: "64px" },
  lg: { box: "h-24 w-24", text: "text-title", px: "96px" },
} as const;

interface AuthorAvatarProps {
  name: string | null | undefined;
  url: string | null | undefined;
  size?: keyof typeof SIZE;
  className?: string;
}

export function AuthorAvatar({ name, url, size = "md", className }: AuthorAvatarProps) {
  const s = SIZE[size];
  const initial = (name?.trim() || "?").charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        "relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/10 bg-mark text-primary",
        s.box,
        className,
      )}
    >
      {url ? (
        // 이름이 바로 옆에 있으므로 대체 글은 비워 두어 낭독기가 두 번 읽지 않게 한다.
        <Image
          src={url}
          alt=""
          fill
          className="object-cover"
          sizes={s.px}
          unoptimized={!isStorageImageUrl(url)}
        />
      ) : (
        <span className={cn("select-none", s.text)} aria-hidden>
          {initial}
        </span>
      )}
    </div>
  );
}
