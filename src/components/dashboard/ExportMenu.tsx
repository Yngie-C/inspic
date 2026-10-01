"use client";

import { useState } from "react";
import { Download, FileText, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadExport, type ExportFormat } from "@/lib/download-export";

interface ExportMenuProps {
  bookId: string;
  bookTitle?: string;
}

export function ExportMenu({ bookId, bookTitle }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setOpen(false);
    setLoading(format);
    setError(null);

    try {
      await downloadExport(bookId, format, bookTitle);
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      // Auto-clear error after 4 seconds
      setTimeout(() => setError(null), 4000);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading !== null}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-primary transition-colors",
          "hover:border-line-strong hover:bg-mark focus:outline-none focus:ring-2 focus:ring-primary",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span>내보내기</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 z-20 mt-1.5 w-52 rounded-lg border border-line bg-surface py-1 shadow-float">
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              disabled={loading !== null}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-primary hover:bg-mark disabled:opacity-50"
            >
              {loading === "pdf" ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-danger" />
              )}
              <div className="text-left">
                <p className="font-medium">PDF로 내보내기</p>
                <p className="text-xs text-muted">인쇄할 수 있는 PDF 파일</p>
              </div>
            </button>

            {/* EPUB은 가려 둡니다. 독자 응답을 싣지 않아 워크북 루프에 쓰이지 않고,
                `/api/epub`은 남아 있어 버튼만 되살리면 다시 쓸 수 있습니다. */}
          </div>
        </>
      )}

      {error && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-danger/40 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
