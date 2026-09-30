import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// DESIGN.md 타이포 토큰(text-caption 등)을 글자 크기로 알려 준다.
// 알려 주지 않으면 text-muted 같은 색 클래스와 충돌한다고 보고 한쪽을 지운다.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "display",
        "title",
        "subtitle",
        "body-reader",
        "body",
        "body-sm",
        "caption",
        "label",
        "button",
        "code",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

export function estimateReadingTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 200));
}

export function generateSlug(orderIndex: number): string {
  return `chapter-${orderIndex}`;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}
