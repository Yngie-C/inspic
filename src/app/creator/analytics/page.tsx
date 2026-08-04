"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Users, FileText, BookMarked } from "lucide-react";
import { StatsCard } from "@/components/analytics/StatsCard";
import { SimpleBarChart } from "@/components/analytics/SimpleBarChart";
import { BookStatsTable } from "@/components/analytics/BookStatsTable";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

type Period = "7d" | "30d" | "all";

interface AnalyticsData {
  overview: {
    total_books: number;
    total_chapters: number;
    total_words: number;
    total_readers: number;
  };
  books: Array<{
    id: string;
    title: string;
    status: string;
    total_chapters: number;
    total_words: number;
    readers: number;
  }>;
  timeline: Array<{ date: string; readers: number }>;
  period: Period;
}

async function fetchAnalytics(period: Period): Promise<AnalyticsData> {
  const res = await fetch(`/api/analytics?period=${period}`);
  if (!res.ok) throw new Error("분석 데이터를 불러오지 못했습니다.");
  const json = await res.json();
  return json.data;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
  { value: "all", label: "전체" },
];

export default function AnalyticsPage() {
  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = useState<Period>("30d");

  const { data, isLoading, isError } = useQuery<AnalyticsData>({
    queryKey: ["analytics", period],
    queryFn: () => fetchAnalytics(period),
    enabled: !!user,
    staleTime: 60_000,
  });

  const chartData = (data?.timeline ?? []).map((item) => ({
    label: item.date.slice(5), // MM-DD
    value: item.readers,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">분석 대시보드</h1>
          <p className="mt-1 text-sm text-gray-500">
            전자책 성과와 독자 현황을 확인하세요
          </p>
        </div>

        {/* Period filter */}
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                period === opt.value
                  ? "bg-brand-600 text-white"
                  : "text-gray-600 hover:bg-gray-100",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-medium text-gray-700">
            데이터를 불러오는 중 오류가 발생했습니다
          </p>
          <p className="mt-1 text-sm text-gray-400">잠시 후 다시 시도해주세요.</p>
        </div>
      ) : data ? (
        <div className="space-y-8">
          {/* Overview cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatsCard
              label="전자책"
              value={data.overview.total_books}
              icon={<BookMarked className="h-5 w-5" />}
            />
            <StatsCard
              label="챕터"
              value={data.overview.total_chapters}
              icon={<BookOpen className="h-5 w-5" />}
            />
            <StatsCard
              label="총 단어수"
              value={data.overview.total_words}
              icon={<FileText className="h-5 w-5" />}
            />
            <StatsCard
              label="독자"
              value={data.overview.total_readers}
              icon={<Users className="h-5 w-5" />}
            />
          </div>

          {/* Reading timeline chart */}
          {chartData.length > 0 && (
            <div>
              <h2 className="mb-4 text-base font-semibold text-gray-900">
                신규 독자
              </h2>
              <SimpleBarChart
                data={chartData}
                valueLabel="명"
                height={180}
              />
            </div>
          )}

          {/* Book stats table */}
          <div>
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              전자책별 통계
            </h2>
            <BookStatsTable books={data.books} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
