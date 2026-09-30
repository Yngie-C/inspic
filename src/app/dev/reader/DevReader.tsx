"use client";

import { useMemo } from "react";
import { ReaderView } from "@/components/reader/ReaderView";
import { WorkbookResponsesProvider } from "@/components/reader/WorkbookResponsesProvider";
import type { WorkbookResponseClient } from "@/lib/workbook/response-client";
import { DEV_BOOK, DEV_CHAPTERS } from "../_mock/book";

/** 네트워크 대신 메모리에 저장하는 가짜 클라이언트. 저장은 400ms 걸린다. */
function memoryClient(fail: boolean): WorkbookResponseClient {
  return {
    async load() {
      return [];
    },
    async save(_bookId, writes) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (fail) throw new Error("dev: 저장 실패");
      return { saved: writes.length, rejected: [] };
    },
  };
}

export function DevReader({ mode }: { mode: string }) {
  const client = useMemo(() => memoryClient(mode === "error"), [mode]);
  const canSave = mode !== "local" && mode !== "preview";

  return (
    <WorkbookResponsesProvider
      bookId={DEV_BOOK.id}
      canSave={canSave}
      viewerId={null}
      client={client}
    >
      <ReaderView
        book={{ ...DEV_BOOK, chapters: DEV_CHAPTERS }}
        access={{
          hasAccess: canSave,
          reason: mode === "preview" ? "preview" : "purchased",
          canRead: true,
          canSaveResponses: canSave,
        }}
        isLoggedIn={mode !== "local"}
        initialIndex={1}
      />
    </WorkbookResponsesProvider>
  );
}
