import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
};

// 색은 현재 텍스트 색을 따른다. 버튼 안에서도, 페이지 위에서도 같은 컴포넌트를 쓴다.
export function Spinner({ className, size = "md" }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="불러오는 중"
      className={cn(
        "animate-spin rounded-full border-current/25 border-t-current",
        sizeMap[size],
        className,
      )}
    />
  );
}
