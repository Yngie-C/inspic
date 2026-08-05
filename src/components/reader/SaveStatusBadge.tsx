"use client";

import { AlertCircle, Check, CloudOff, Loader2 } from "lucide-react";
import { useWorkbookSaveStatus } from "./WorkbookResponsesProvider";

/**
 * 워크북 응답이 어디까지 저장됐는지 보여 줍니다.
 *
 * 독자가 답을 쓰는 화면에서 가장 불안한 것은 "이게 남았나"입니다. 저장이
 * 낙관적이라 화면은 바로 바뀌므로, 실제 저장 여부를 따로 말해 주지 않으면
 * 실패했을 때 알 방법이 없습니다.
 */
export function SaveStatusBadge() {
  const { saveState, saveError, retry } = useWorkbookSaveStatus();

  if (saveState === "loading" || saveState === "idle") return null;

  if (saveState === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        저장 중
      </span>
    );
  }

  if (saveState === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-400">
        <Check className="h-3.5 w-3.5" />
        저장됨
      </span>
    );
  }

  if (saveState === "local-only") {
    return (
      <span
        className="flex items-center gap-1.5 text-xs text-amber-600"
        title="작성한 내용이 이 브라우저에만 남습니다."
      >
        <CloudOff className="h-3.5 w-3.5" />
        이 기기에만 저장됨
      </span>
    );
  }

  return (
    <button
      onClick={retry}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
      title={saveError ?? undefined}
    >
      <AlertCircle className="h-3.5 w-3.5" />
      저장 실패 · 다시 시도
    </button>
  );
}
