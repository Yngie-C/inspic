"use client";

import { AlertCircle, CloudOff } from "lucide-react";
import { useWorkbookSaveStatus } from "./WorkbookResponsesProvider";

/**
 * 워크북 응답이 어디까지 저장됐는지 보여 줍니다.
 *
 * 독자가 답을 쓰는 화면에서 가장 불안한 것은 "이게 남았나"입니다. 저장이
 * 낙관적이라 화면은 바로 바뀌므로, 실제 저장 여부를 따로 말해 주지 않으면
 * 실패했을 때 알 방법이 없습니다.
 */
export function SaveStatusBadge({ isPreview = false }: { isPreview?: boolean }) {
  const { saveState, saveError, retry } = useWorkbookSaveStatus();

  if (saveState === "loading" || saveState === "idle") return null;

  if (saveState === "saving") {
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap text-caption text-muted">
        저장 중
      </span>
    );
  }

  if (saveState === "saved") {
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap text-caption text-muted">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
        저장됨
      </span>
    );
  }

  if (saveState === "local-only") {
    // 미리보기는 예정된 상태라 경고가 아니다. 본문 안내와 같은 info로 말한다.
    if (isPreview) {
      return (
        <span
          className="flex items-center gap-1.5 whitespace-nowrap text-caption text-info"
          title="미리보기에서 쓴 답은 이 브라우저에만 남아요."
        >
          <CloudOff className="h-4 w-4" strokeWidth={1.75} />
          미리보기 · 이 기기에만
        </span>
      );
    }
    return (
      <span
        className="flex items-center gap-1.5 whitespace-nowrap text-caption text-warning"
        title="작성한 내용이 이 브라우저에만 남아요."
      >
        <CloudOff className="h-4 w-4" strokeWidth={1.75} />
        이 기기에만 저장됨
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={retry}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-caption font-semibold text-danger transition-colors duration-150 ease-out hover:bg-mark"
      title={saveError ?? undefined}
    >
      <AlertCircle className="h-4 w-4" strokeWidth={1.75} />
      저장 실패 · 다시 시도
    </button>
  );
}
