"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookGrid } from "@/components/explore/BookGrid";
import type { BookWithAuthor } from "@/components/explore/BookPreviewCard";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface LandingData {
  newest: BookWithAuthor[];
}

async function fetchLanding(): Promise<LandingData> {
  const res = await fetch("/api/landing");
  if (!res.ok) throw new Error("책 목록을 불러오지 못했어요.");
  const json = await res.json();
  return json.data as LandingData;
}

/**
 * 새로 나온 책. 0권이거나 조회에 실패해도 섹션을 지우지 않고 그 사실을 씁니다 —
 * 지우면 메인 영역 바로 아래에 저자 블록이 붙어 책 없는 서점처럼 보입니다.
 */
export function NewBooksSection() {
  const { data, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: ["landing"],
    queryFn: fetchLanding,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <section className="flex flex-col gap-3.5 border-t border-line pb-14 pt-10 max-[600px]:pb-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-label text-muted">새로 나온 책</h2>
        <Link
          href="/explore?sort=newest"
          className="text-body-sm text-muted transition-colors duration-150 ease-out hover:text-primary"
        >
          전체 보기
        </Link>
      </div>

      {isPending ? (
        <div className="flex min-h-[240px] items-center justify-center text-muted">
          <Spinner />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex flex-col gap-1">
            <p className="text-subtitle text-primary">책 목록을 불러오지 못했어요</p>
            <p className="text-body-sm text-muted">연결을 확인한 뒤 다시 불러와 주세요.</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => void refetch()}
            isLoading={isRefetching}
          >
            다시 불러오기
          </Button>
        </div>
      ) : (
        <BookGrid books={data.newest} />
      )}
    </section>
  );
}
