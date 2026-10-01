import type { CSSProperties, ReactNode } from "react";
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
  /**
   * `box`는 독자가 쓰는 블록, `line`은 입력이 없는 Callout("책이 말하는 영역")이다.
   * Callout을 박스로 그리면 입력 블록과 구분되지 않는다(DESIGN.md 워크북 블록).
   */
  shape?: "box" | "line";
  className?: string;
  children: ReactNode;
}

export function WorkbookBlock({
  kind,
  kindTone = "muted",
  aside,
  shape = "box",
  className,
  children,
}: WorkbookBlockProps) {
  return (
    <div
      className={cn(
        "my-6 flex flex-col text-body text-primary",
        shape === "box" &&
          "gap-3 rounded-lg border border-line bg-paper px-5 py-[18px] max-[600px]:p-3.5",
        shape === "line" && "gap-2 border-l-2 border-line-strong py-1 pl-4",
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

/**
 * 저장 실패를 블록 안에서 말한다. 무엇이 잘못됐고 어떻게 고치는지를 함께 쓴다
 * (DESIGN.md "danger는 항상 오류 문장과 함께").
 */
export function BlockSaveError({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-body-sm text-danger">
      이 답을 저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.
      <button
        type="button"
        onClick={onRetry}
        className="font-semibold underline decoration-1 underline-offset-3"
      >
        다시 시도
      </button>
    </p>
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
    "flex h-11 w-full items-center justify-center rounded-sm border p-0 text-body-sm tabular-nums transition-colors duration-150 ease-out",
    selected
      ? "border-accent bg-accent font-bold text-on-accent"
      : "border-field-line bg-field text-primary",
  );
}

/** 척도 칸 격자. 칸 수(min~max)가 책마다 달라 열 수를 인라인으로 줍니다. */
/**
 * 척도 격자 열 수. 모바일에서 7칸을 넘으면 두 줄로 접어 칸이 44px 탭 영역을 지키게 한다.
 * `scaleGridClass`가 `--scale-cols`/`--scale-cols-sm`을 읽는다.
 */
export const scaleGridClass =
  "grid grid-cols-[repeat(var(--scale-cols),minmax(0,1fr))] gap-1 max-[600px]:grid-cols-[repeat(var(--scale-cols-sm),minmax(0,1fr))] max-[600px]:gap-1.5";

export function scaleGridStyle(count: number) {
  const sm = count > 7 ? Math.ceil(count / 2) : count;
  return {
    "--scale-cols": count,
    "--scale-cols-sm": sm,
  } as CSSProperties;
}

/** SMART 목표 문항 라벨: 한글 질문을 앞에, 영어 용어를 뒤에 둔다. */
export function SmartFieldLabel({
  term,
  question,
}: {
  term: string;
  question: string;
}) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-body-sm font-semibold text-primary">{question}</span>
      <span className="text-caption text-muted">{term}</span>
    </span>
  );
}
