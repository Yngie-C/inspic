"use client";

import { motion } from "framer-motion";
import { Search, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function HeroSection({ totalBooks }: { totalBooks?: number }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) router.push(`/explore?q=${encodeURIComponent(query)}`);
  };

  return (
    <section className="relative overflow-hidden bg-white pt-20 pb-16 md:pt-32 md:pb-24">
      {/* 배경 장식 (심플한 그라데이션 블러) */}
      <div className="absolute top-0 left-1/2 -z-10 h-[400px] w-[800px] -translate-x-1/2 opacity-20 blur-[120px] bg-gradient-to-r from-brand-400 to-orange-300" />

      <div className="mx-auto max-w-5xl px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-logo text-5xl font-bold tracking-tight text-gray-900 md:text-7xl">
            읽고, 쓰고, <br />
            <span className="text-brand-600">적용하세요</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-500 md:text-xl">
            워크시트와 질문이 담긴 워크북형 전자책. <br className="hidden md:block" />
            읽으면서 직접 쓰고, 쓴 답은 계정에 남습니다.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="h-14 px-8 rounded-full text-base" asChild>
              <Link href="/explore">
                콘텐츠 둘러보기 <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>

            <form onSubmit={handleSearch} className="relative w-full max-w-sm">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="관심 있는 주제 검색..."
                className="h-14 w-full rounded-full border border-gray-200 bg-gray-50 pl-12 pr-6 text-sm outline-none transition-all focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-50"
              />
            </form>
          </div>

          {totalBooks != null && (
            <p className="mt-6 text-sm font-medium text-gray-400">
              이미 <span className="text-gray-900">{totalBooks.toLocaleString()}권</span>의 이야기가 출판되었습니다.
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
