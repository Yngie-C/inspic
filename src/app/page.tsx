"use client";

import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/landing/HeroSection";
import { BookSection } from "@/components/landing/BookSection";
import { BookSectionSkeleton } from "@/components/landing/BookSectionSkeleton";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import type { Book } from "@/types";

interface BookWithAuthor extends Book {
  author_name?: string | null;
}

interface LandingData {
  newest: BookWithAuthor[];
  stats: {
    totalBooks: number;
  };
}

export default function LandingPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["landing"],
    queryFn: async () => {
      const res = await fetch("/api/landing");
      if (!res.ok) throw new Error("Failed to fetch landing data");
      const json = await res.json();
      return json.data as LandingData;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Header />

      {/* Hero */}
      <HeroSection totalBooks={data?.stats?.totalBooks} />

      {/* 핵심 가치 섹션 */}
      <FeaturesSection />

      {/* Content Sections */}
      <main className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6">
        {isError && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-medium text-primary">
              책 목록을 불러오지 못했어요
            </p>
            <p className="mt-1 text-sm text-muted">연결을 확인하고 페이지를 새로고침해 주세요.</p>
          </div>
        )}

        {/* Newest */}
        {isLoading ? (
          <div className="mb-24"><BookSectionSkeleton /></div>
        ) : data?.newest && data.newest.length > 0 ? (
          <div className="mb-24">
            <BookSection
              title="새로 나온 책"
              moreHref="/explore?sort=newest"
              books={data.newest}
            />
          </div>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
