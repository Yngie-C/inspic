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
    <section className="relative overflow-hidden bg-paper pt-20 pb-16 md:pt-32 md:pb-24">
      {/* 배경 장식 (심플한 그라데이션 블러) */}

      <div className="mx-auto max-w-5xl px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-5xl font-bold tracking-tight text-primary md:text-7xl">
            바로 써먹는 지식을, <br />
            짧게 읽으세요
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted md:text-xl">
            한 장이 몇 분이면 끝나요. <br className="hidden md:block" />
            읽다가 나오는 체크리스트와 질문에 답하면 그 답이 내 계정에 남아요.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="h-12 px-6" asChild>
              <Link href="/explore">
                책 둘러보기 <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>

            <form onSubmit={handleSearch} className="relative w-full max-w-sm">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="책 제목이나 주제로 검색"
                className="h-12 w-full rounded-md border border-field-line bg-paper pl-12 pr-6 text-sm outline-none transition-all focus:outline-2 focus:outline-offset-1 focus:outline-primary"
              />
            </form>
          </div>

          {/* 0권일 때 "0권"은 빈 서점을 광고하는 문장이라 숨긴다. */}
          {totalBooks != null && totalBooks > 0 && (
            <p className="mt-6 text-sm font-medium text-muted">
              지금 읽을 수 있는 책 <span className="text-primary">{totalBooks.toLocaleString()}권</span>
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
