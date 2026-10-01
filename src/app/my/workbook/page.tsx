"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { BookOpen, FileText, Loader2, PenLine } from "lucide-react";
import { BookCover } from "@/components/ui/book-cover";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/stores/auth-store";
import { downloadExport } from "@/lib/download-export";
import { cn } from "@/lib/utils";

interface WorkbookSummary {
  book_id: string;
  title: string;
  cover_image_url: string | null;
  author_name: string | null;
  total_fields: number;
  answered_fields: number;
  last_written_at: string;
}

async function fetchWorkbooks(): Promise<WorkbookSummary[]> {
  const res = await fetch("/api/my/workbooks");
  if (!res.ok) throw new Error("워크북 목록을 불러오지 못했어요.");
  const json = await res.json();
  return json.data ?? [];
}

export default function MyWorkbookPage() {
  const user = useAuthStore((s) => s.user);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    data: workbooks = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<WorkbookSummary[]>({
    queryKey: ["my-workbooks"],
    queryFn: fetchWorkbooks,
    enabled: !!user,
  });

  const handleDownload = async (workbook: WorkbookSummary) => {
    setDownloading(workbook.book_id);
    setError(null);
    try {
      await downloadExport(workbook.book_id, "pdf", workbook.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF를 만들지 못했어요. 잠시 뒤 다시 받아 주세요.");
      setTimeout(() => setError(null), 4000);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-primary">내 워크북</h1>
        <p className="mt-1 text-sm text-muted">
          답을 쓴 책이 여기 모여요. PDF로 받으면 책 본문과 내 답이 함께 담겨요.
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-danger/40 p-8 text-center text-body-sm text-danger">
            워크북 목록을 불러오지 못했어요.{" "}
            <button onClick={() => refetch()} className="underline">
              다시 시도
            </button>
          </div>
        ) : workbooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-line py-20 text-center">
            <PenLine className="h-16 w-16 text-faint" />
            <div>
              <p className="text-lg font-semibold text-primary">
                아직 쓴 답이 없어요
              </p>
              <p className="mt-1 text-sm text-muted">
                책을 읽다가 체크리스트나 질문에 답하면 여기 모여요.
              </p>
            </div>
            <Button asChild>
              <Link href="/explore">책 둘러보기</Link>
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col border-t border-line">
            {workbooks.map((workbook) => (
              <WorkbookRow
                key={workbook.book_id}
                workbook={workbook}
                downloading={downloading === workbook.book_id}
                onDownload={() => handleDownload(workbook)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WorkbookRow({
  workbook,
  downloading,
  onDownload,
}: {
  workbook: WorkbookSummary;
  downloading: boolean;
  onDownload: () => void;
}) {
  const { total_fields: total, answered_fields: answered } = workbook;
  // 문항이 하나도 없는 책에서 0으로 나누지 않습니다. 저자가 워크북 블록을
  // 전부 지운 뒤에도 답은 남아 있을 수 있습니다.
  const percent = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <li className="flex items-center gap-4 border-b border-line py-4">
      <div className="relative h-20 w-15 shrink-0 overflow-hidden rounded-sm border border-primary/10">
        <BookCover
          bookId={workbook.book_id}
          title={workbook.title}
          coverImageUrl={workbook.cover_image_url}
          sizes="60px"
          size="sm"
          className="p-1.5 [&>span:first-child]:text-[10px] [&>span:first-child]:leading-tight [&>span:last-child]:hidden"
        />
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-subtitle text-primary">{workbook.title}</h2>
        {workbook.author_name && (
          <p className="truncate text-caption text-muted">{workbook.author_name}</p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <div className="h-0.5 w-full max-w-40 overflow-hidden bg-line">
            <div
              className={cn(
                "h-full bg-accent",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className={cn("shrink-0 text-caption tabular-nums", percent === 100 ? "font-semibold text-accent" : "text-muted")}>
            {total > 0 ? `${answered}/${total} 문항` : "문항 없음"}
          </span>
        </div>

        {workbook.last_written_at && (
          <p className="mt-1.5 text-caption text-muted">
            {new Date(workbook.last_written_at).toLocaleDateString("ko-KR")}에 마지막으로 씀
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        <Button size="sm" variant="secondary" asChild>
          <Link href={`/reader/${workbook.book_id}`}>
            <BookOpen className="mr-1 h-3.5 w-3.5" />
            이어 쓰기
          </Link>
        </Button>
        <Button size="sm" onClick={onDownload} disabled={downloading}>
          {downloading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="mr-1 h-3.5 w-3.5" />
          )}
          PDF 받기
        </Button>
      </div>
    </li>
  );
}
