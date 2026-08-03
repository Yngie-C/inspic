"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ArrowLeft, List, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Book, Chapter } from "@/types";
import { HtmlContentRenderer } from "@/components/reader/HtmlContentRenderer";

async function fetchBook(id: string): Promise<Book> {
  const res = await fetch(`/api/books/${id}`);
  if (!res.ok) throw new Error("책을 불러오지 못했습니다.");
  return (await res.json()).data;
}

async function fetchChapters(bookId: string): Promise<Chapter[]> {
  const res = await fetch(`/api/chapters?bookId=${bookId}`);
  if (!res.ok) throw new Error("챕터를 불러오지 못했습니다.");
  return (await res.json()).data ?? [];
}

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();

  const { data: book, isLoading: bookLoading } = useQuery<Book>({
    queryKey: ["book", bookId],
    queryFn: () => fetchBook(bookId),
  });

  const { data: chapters = [], isLoading: chaptersLoading } = useQuery<Chapter[]>({
    queryKey: ["chapters", bookId],
    queryFn: () => fetchChapters(bookId),
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);

  const currentChapter = chapters[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === chapters.length - 1;

  const goTo = (index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, chapters.length - 1)));
    setTocOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (bookLoading || chaptersLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!book || chapters.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-gray-500">
        <p>읽을 수 있는 챕터가 없습니다.</p>
        <Button variant="outline" onClick={() => router.push("/my/library")}>
          대시보드로
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Reader toolbar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/my/library")}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-gray-900">{book.title}</p>
            <p className="text-xs text-gray-400">{currentChapter?.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <List className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex">
        {/* TOC Drawer */}
        {tocOpen && (
          <aside className="fixed inset-y-0 left-0 z-40 w-72 border-r border-gray-200 bg-white pt-16 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="font-semibold text-gray-900">목차</span>
              <button
                onClick={() => setTocOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="overflow-y-auto py-2">
              {chapters.map((ch, idx) => (
                <button
                  key={ch.id}
                  onClick={() => goTo(idx)}
                  className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                    idx === currentIndex
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span className="mr-2 text-xs opacity-60">{idx + 1}.</span>
                  {ch.title}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* Chapter content */}
        <main className="mx-auto max-w-2xl flex-1 px-6 py-10 sm:px-8">
          {currentChapter && (
            <>
              <h1 className="mb-8 text-2xl font-bold text-gray-900">
                {currentChapter.title}
              </h1>
              <HtmlContentRenderer
                html={currentChapter.content_html}
                theme="light"
                fontSize={16}
                lineHeight={1.8}
                chapterId={currentChapter.id}
                className="prose prose-gray max-w-none leading-relaxed text-gray-800"
              />
            </>
          )}

          {/* Navigation */}
          <div className="mt-16 flex items-center justify-between border-t border-gray-100 pt-8">
            <Button
              variant="outline"
              onClick={() => goTo(currentIndex - 1)}
              disabled={isFirst}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              이전 챕터
            </Button>
            <span className="text-sm text-gray-400">
              {currentIndex + 1} / {chapters.length}
            </span>
            <Button
              variant="outline"
              onClick={() => goTo(currentIndex + 1)}
              disabled={isLast}
            >
              다음 챕터
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
