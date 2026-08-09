"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, FileText, Loader2, PenLine } from "lucide-react";
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
  if (!res.ok) throw new Error("워크북 목록을 불러오지 못했습니다.");
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
      setError(err instanceof Error ? err.message : "PDF를 만들지 못했습니다.");
      setTimeout(() => setError(null), 4000);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">내 워크북</h1>
        <p className="mt-1 text-sm text-gray-500">
          답을 쓴 책이 모입니다. PDF로 받으면 내가 쓴 내용이 그대로 담깁니다.
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
            워크북 목록을 불러오지 못했습니다.{" "}
            <button onClick={() => refetch()} className="underline">
              다시 시도
            </button>
          </div>
        ) : workbooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-200 bg-white py-20 text-center">
            <PenLine className="h-16 w-16 text-gray-300" />
            <div>
              <p className="text-lg font-semibold text-gray-700">
                아직 쓴 답이 없습니다
              </p>
              <p className="mt-1 text-sm text-gray-400">
                책을 읽으며 워크북에 답을 쓰면 여기 모입니다.
              </p>
            </div>
            <Button asChild>
              <Link href="/explore">전자책 둘러보기</Link>
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
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
    <li className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="relative h-20 w-15 shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {workbook.cover_image_url ? (
          <Image
            src={workbook.cover_image_url}
            alt={workbook.title}
            fill
            className="object-cover"
            sizes="60px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-300 to-gray-400">
            <span className="text-2xl font-bold text-white/80 select-none">
              {workbook.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-gray-900">{workbook.title}</h2>
        {workbook.author_name && (
          <p className="truncate text-xs text-gray-500">{workbook.author_name}</p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-gray-100">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                percent === 100 ? "bg-emerald-500" : "bg-gray-900",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="shrink-0 text-xs text-gray-500">
            {total > 0 ? `${answered}/${total} 문항` : "문항 없음"}
          </span>
        </div>

        {workbook.last_written_at && (
          <p className="mt-1.5 text-xs text-gray-400">
            {new Date(workbook.last_written_at).toLocaleDateString("ko-KR")}에 마지막으로 씀
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        <Button size="sm" variant="outline" asChild>
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
