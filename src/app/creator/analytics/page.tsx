"use client";

import { useQuery } from "@tanstack/react-query";
import { WorkbookEngagementSection } from "@/components/analytics/WorkbookEngagement";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/stores/auth-store";
import type { Book } from "@/types";

async function fetchBooks(): Promise<Book[]> {
  const res = await fetch("/api/books");
  if (!res.ok) throw new Error("책 목록을 불러오지 못했습니다.");
  const json = await res.json();
  return json.data ?? [];
}

export default function AnalyticsPage() {
  const user = useAuthStore((s) => s.user);

  const { data: books, isLoading, isError } = useQuery<Book[]>({
    queryKey: ["books"],
    queryFn: fetchBooks,
    enabled: !!user,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary">분석</h1>
        <p className="mt-1 text-sm text-muted">
          독자가 워크북에 얼마나 답하고 있는지 확인하세요
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-medium text-primary">
            데이터를 불러오는 중 오류가 발생했습니다
          </p>
          <p className="mt-1 text-sm text-muted">잠시 후 다시 시도해주세요.</p>
        </div>
      ) : books && books.length > 0 ? (
        <WorkbookEngagementSection
          books={books.map((book) => ({ id: book.id, title: book.title }))}
        />
      ) : books ? (
        <p className="py-24 text-center text-sm text-muted">
          아직 만든 책이 없습니다.
        </p>
      ) : null}
    </div>
  );
}
