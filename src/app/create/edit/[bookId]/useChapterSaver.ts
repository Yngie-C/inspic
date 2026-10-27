"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CLEAN_STATUS,
  ChapterSaveQueue,
  saveChapterRequest,
  type ChapterSaveStatus,
} from "@/lib/chapter-save-queue";
import type { Chapter } from "@/types";

function isSavedChapter(value: unknown): value is Pick<Chapter, "id" | "title" | "content_html"> {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.content_html === "string"
  );
}

/**
 * 편집 화면의 장 저장 줄을 React에 붙입니다. 규칙은 `ChapterSaveQueue`를
 * 보세요.
 *
 * - 저장이 성공하면 장 목록 캐시의 그 장을 서버가 돌려준 행으로 바꿔
 *   둡니다. 다시 불러오기가 끝나기 전에 그 장을 다시 열어도 옛 본문으로
 *   편집을 시작하지 않게 하기 위해서입니다.
 * - 저장 안 된 입력이나 실패가 남아 있으면 창 닫기를 막습니다(P1-11).
 * - 화면을 떠나면(앱 안 이동) 대기 중인 저장을 바로 보냅니다.
 */
export function useChapterSaver(bookId: string) {
  const qc = useQueryClient();
  const [queue] = useState(() => new ChapterSaveQueue(saveChapterRequest));
  const statuses = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);

  useEffect(
    () =>
      queue.onSaved((chapterId, { chapter }) => {
        if (isSavedChapter(chapter)) {
          qc.setQueryData<Chapter[]>(["chapters", bookId], (old) =>
            old?.map((c) =>
              c.id === chapterId
                ? { ...c, title: chapter.title, content_html: chapter.content_html }
                : c,
            ),
          );
        }
        qc.invalidateQueries({ queryKey: ["chapters", bookId] });
        qc.invalidateQueries({ queryKey: ["publish-blockers", bookId] });
      }),
    [queue, qc, bookId],
  );

  useEffect(
    () => () => {
      void queue.flushAll();
    },
    [queue],
  );

  let hasUnsaved = false;
  for (const status of statuses.values()) {
    if (status.dirty || status.failure) hasUnsaved = true;
  }

  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 오래된 브라우저는 returnValue가 있어야 묻습니다.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);

  const statusOf = (chapterId: string | null): ChapterSaveStatus =>
    (chapterId && statuses.get(chapterId)) || CLEAN_STATUS;

  return { queue, statusOf, hasUnsaved };
}
