"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ArrowLeft, List, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Book, Chapter } from "@/types";
import type { AccessReason } from "@/lib/access-control";
import { HtmlContentRenderer } from "@/components/reader/HtmlContentRenderer";
import { SaveStatusBadge } from "@/components/reader/SaveStatusBadge";
import { WorkbookResponsesProvider } from "@/components/reader/WorkbookResponsesProvider";
import { useAuthStore } from "@/stores/auth-store";

/**
 * 워크북을 읽고 쓰는 화면.
 *
 * 여기서 독자가 쓴 답은 `workbook_responses`로 갑니다. 저장 경로는
 * `WorkbookResponsesProvider` 하나이며, 블록 컴포넌트는 자기 응답만
 * 읽고 씁니다.
 *
 * 로그인을 요구하는 것은 응답이 계정에 남아야 하기 때문입니다. 답을 다
 * 쓴 뒤에 "로그인해야 저장됩니다"를 만나는 것보다, 들어올 때 한 번 막는
 * 편이 낫습니다.
 */

interface ReaderBook extends Book {
  chapters: Chapter[];
}

class ReaderLoadError extends Error {
  constructor(readonly status: number) {
    super(`reader load failed: ${status}`);
  }
}

async function fetchReaderBook(bookId: string): Promise<ReaderBook> {
  const res = await fetch(`/api/books/${bookId}`);
  if (!res.ok) throw new ReaderLoadError(res.status);
  return (await res.json()).data;
}

async function fetchAccess(
  bookId: string,
): Promise<{ hasAccess: boolean; reason: AccessReason }> {
  const res = await fetch(`/api/books/${bookId}/access`);
  if (!res.ok) throw new Error("접근 권한을 확인하지 못했습니다.");
  return (await res.json()).data;
}

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const {
    data: book,
    isLoading: bookLoading,
    error,
  } = useQuery<ReaderBook>({
    queryKey: ["reader-book", bookId],
    queryFn: () => fetchReaderBook(bookId),
    enabled: isInitialized && !!user,
    retry: false,
  });

  const { data: access, isLoading: accessLoading } = useQuery({
    queryKey: ["book-access", bookId],
    queryFn: () => fetchAccess(bookId),
    enabled: isInitialized && !!user,
    retry: false,
  });

  if (!isInitialized || ((bookLoading || accessLoading) && user)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <ReaderNotice
        title="로그인하고 읽어 주세요"
        description="워크북에 쓴 답은 계정에 저장됩니다. 로그인하면 다른 기기에서도 이어서 쓸 수 있습니다."
        action={{ href: `/auth/login?redirect=/reader/${bookId}`, label: "로그인" }}
      />
    );
  }

  if (error) {
    const status = error instanceof ReaderLoadError ? error.status : 500;
    return (
      <ReaderNotice
        title={status === 404 ? "책을 찾을 수 없습니다" : "지금은 읽을 수 없습니다"}
        description={
          status === 404
            ? "삭제되었거나 주소가 잘못됐습니다."
            : "이 책을 볼 권한이 없습니다."
        }
        action={{ href: "/explore", label: "둘러보기" }}
      />
    );
  }

  if (!book) return null;

  if (access && !access.hasAccess) {
    return (
      <ReaderNotice
        title="아직 구매하지 않은 책입니다"
        description="구매하면 워크북을 작성하며 읽을 수 있습니다."
        action={{ href: `/book/${bookId}`, label: "책 정보 보기" }}
      />
    );
  }

  if (book.chapters.length === 0) {
    return (
      <ReaderNotice
        title="아직 공개된 챕터가 없습니다"
        description="저자가 챕터를 공개하면 여기에서 읽을 수 있습니다."
        action={{ href: "/my/library", label: "내 서재로" }}
      />
    );
  }

  return (
    <WorkbookResponsesProvider
      bookId={bookId}
      canSave={access?.hasAccess ?? false}
    >
      <ReaderView book={book} />
    </WorkbookResponsesProvider>
  );
}

function ReaderView({ book }: { book: ReaderBook }) {
  const router = useRouter();
  const chapters = book.chapters;

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

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/my/library")}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="내 서재로"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-gray-900">{book.title}</p>
            <p className="text-xs text-gray-400">{currentChapter?.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SaveStatusBadge />
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="목차"
          >
            <List className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex">
        {tocOpen && (
          <aside className="fixed inset-y-0 left-0 z-40 w-72 border-r border-gray-200 bg-white pt-16 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="font-semibold text-gray-900">목차</span>
              <button
                onClick={() => setTocOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
                aria-label="목차 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="overflow-y-auto py-2">
              {chapters.map((chapter, index) => (
                <button
                  key={chapter.id}
                  onClick={() => goTo(index)}
                  className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                    index === currentIndex
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span className="mr-2 text-xs opacity-60">{index + 1}.</span>
                  {chapter.title}
                </button>
              ))}
            </nav>
          </aside>
        )}

        <main className="mx-auto max-w-2xl flex-1 px-6 py-10 sm:px-8">
          {currentChapter && (
            <>
              <h1 className="mb-8 text-2xl font-bold text-gray-900">
                {currentChapter.title}
              </h1>
              <HtmlContentRenderer
                html={currentChapter.content_html}
                className="prose prose-gray max-w-none text-[17px] leading-8 text-gray-800"
              />
            </>
          )}

          <div className="mt-16 flex items-center justify-between border-t border-gray-100 pt-8">
            <Button
              variant="outline"
              onClick={() => goTo(currentIndex - 1)}
              disabled={isFirst}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
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
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}

function ReaderNotice({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: { href: string; label: string };
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <p className="max-w-sm text-sm text-gray-500">{description}</p>
      <Button asChild variant="outline" className="mt-2">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    </div>
  );
}
