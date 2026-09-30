import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BlockStatus } from "@/lib/workbook/block-status";

/**
 * 워크북 블록 5종이 함께 쓰는 틀 (DESIGN.md "워크북 블록").
 *
 * 읽기 뷰(`reader/templates/*`)와 편집 뷰(`editor/extensions/templates/*`)가
 * 같은 틀을 씁니다. 블록 종류는 면색이나 아이콘이 아니라 머리 줄의 라벨
 * 텍스트로만 구분합니다.
 */

interface WorkbookBlockProps {
  /** 머리 줄 왼쪽 라벨. 예: 체크리스트, 척도, 성찰, 목표, 참고 */
  kind: ReactNode;
  /** `주의` 콜아웃만 warning 색을 씁니다. */
  kindTone?: "muted" | "warning";
  /** 머리 줄 오른쪽. 읽기 뷰는 상태, 편집 뷰는 편집 컨트롤. */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function WorkbookBlock({
  kind,
  kindTone = "muted",
  aside,
  className,
  children,
}: WorkbookBlockProps) {
  return (
    <div
      className={cn(
        "my-6 flex flex-col gap-3 rounded-lg border border-line bg-paper px-5 py-[18px] text-body text-primary max-[600px]:p-3.5",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "text-label",
            kindTone === "warning" ? "text-warning" : "text-muted",
          )}
        >
          {kind}
        </span>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function BlockStatusText({ status }: { status: BlockStatus }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap text-caption tabular-nums",
        status.tone === "ok" && "font-semibold text-accent",
        status.tone === "muted" && "text-muted",
        status.tone === "danger" && "font-semibold text-danger",
      )}
    >
      {status.text}
    </span>
  );
}

export function BlockQuestion({ children }: { children: ReactNode }) {
  return <p className="m-0 text-subtitle text-primary">{children}</p>;
}

/** "내가 쓰는 영역". textarea와 input이 함께 씁니다. */
export const blockFieldClass =
  "w-full rounded-md border border-field-line bg-field px-3 py-2.5 text-body text-primary placeholder:text-muted";

/** 척도 칸. 선택 여부에 따라 면이 바뀝니다. */
export function scaleCellClass(selected: boolean) {
  return cn(
    "flex h-11 w-full items-center justify-center max-[600px]:h-auto max-[600px]:aspect-square rounded-sm border p-0 text-body-sm tabular-nums transition-colors duration-150 ease-out",
    selected
      ? "border-accent bg-accent font-bold text-on-accent"
      : "border-field-line bg-field text-primary",
  );
}

/** 척도 칸 격자. 칸 수(min~max)가 책마다 달라 열 수를 인라인으로 줍니다. */
export function scaleGridStyle(count: number) {
  return { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` };
}
