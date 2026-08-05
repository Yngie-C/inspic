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
 * 로그인은 요구하지 않습니다. 무료 책은 누구나 읽고, 유료 책은 첫
 * 챕터가 미리보기로 열립니다. 대신 **저장되지 않는 상태를 숨기지
 * 않습니다** — 답이 이 기기에만 남는 동안에는 화면이 계속 그렇게
 * 말합니다. "저장되는 줄 알았는데 아니었다"가 이 화면에서 가장 나쁜
 * 실패입니다.
 */

interface ReaderBook extends Book {
  chapters: Chapter[];
}

interface AccessInfo {
  hasAccess: boolean;
  reason: AccessReason;
  canRead: boolean;
  canSaveResponses: boolean;
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

async function fetchAccess(bookId: string): Promise<AccessInfo> {
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
    enabled: isInitialized,
    retry: false,
  });

  const { data: access, isLoading: accessLoading } = useQuery<AccessInfo>({
    // 로그인 여부가 판정을 바꾸므로 키에 넣습니다. 없으면 로그인하고
    // 돌아왔을 때 비로그인 시절의 판정이 그대로 쓰입니다.
    queryKey: ["book-access", bookId, user?.id ?? null],
    queryFn: () => fetchAccess(bookId),
    enabled: isInitialized,
    retry: false,
  });

  if (!isInitialized || bookLoading || accessLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
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

  if (!book || !access) return null;

  if (!access.canRead) {
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
        action={{ href: `/book/${bookId}`, label: "책 정보 보기" }}
      />
    );
  }

  return (
    <WorkbookResponsesProvider
      bookId={bookId}
      canSave={access.canSaveResponses}
      viewerId={user?.id ?? null}
    >
      <ReaderView book={book} access={access} isLoggedIn={!!user} />
    </WorkbookResponsesProvider>
  );
}

function ReaderView({
  book,
  access,
  isLoggedIn,
}: {
  book: ReaderBook;
  access: AccessInfo;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const chapters = book.chapters;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);

  const currentChapter = chapters[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === chapters.length - 1;
  const isPreview = access.reason === "preview";
  const backHref = isLoggedIn ? "/my/library" : "/explore";

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
            onClick={() => router.push(backHref)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label={isLoggedIn ? "내 서재로" : "둘러보기로"}
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
          {!access.canSaveResponses && (
            <UnsavedNotice
              bookId={book.id}
              isPreview={isPreview}
              isLoggedIn={isLoggedIn}
            />
          )}

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

          {isPreview ? (
            <PreviewEnd bookId={book.id} price={book.price} />
          ) : (
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
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * 답이 서버에 저장되지 않는 동안 띄우는 안내.
 *
 * 워크북 블록은 이 상태에서도 그려지고 입력도 됩니다 (값은 이 기기에
 * 남습니다). 그래서 쓰기 **전에** 말해 줘야 합니다 — 다 쓴 뒤에
 * 알게 되는 것이 최악입니다.
 */
function UnsavedNotice({
  bookId,
  isPreview,
  isLoggedIn,
}: {
  bookId: string;
  isPreview: boolean;
  isLoggedIn: boolean;
}) {
  const { title, description, href, label } = isPreview
    ? {
        title: "미리보기로 읽고 있습니다",
        description:
          "여기에 쓴 답은 이 기기에만 남습니다. 구매하면 계정에 저장되고 다른 기기에서 이어서 쓸 수 있습니다.",
        href: `/book/${bookId}`,
        label: "구매하기",
      }
    : {
        title: "답이 이 기기에만 저장됩니다",
        description:
          "로그인하면 지금까지 쓴 답이 계정에 저장되고, 다른 기기에서 이어서 쓸 수 있습니다.",
        href: `/auth/login?redirect=/reader/${bookId}`,
        label: isLoggedIn ? "책 정보 보기" : "로그인",
      };

  return (
    <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-900">{title}</p>
      <p className="mt-1 text-sm text-amber-800">{description}</p>
      <Button asChild variant="outline" size="sm" className="mt-3 bg-white">
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}

/** 미리보기 챕터의 끝. 다음 챕터 대신 구매로 이어집니다. */
function PreviewEnd({ bookId, price }: { bookId: string; price: number }) {
  return (
    <div className="mt-16 rounded-2xl border border-gray-200 bg-gray-50 px-6 py-8 text-center">
      <p className="text-base font-semibold text-gray-900">
        미리보기는 여기까지입니다
      </p>
      <p className="mt-2 text-sm text-gray-600">
        나머지 챕터와 워크북 저장은 구매 후에 열립니다.
      </p>
      <Button asChild className="mt-5 rounded-full">
        <Link href={`/book/${bookId}`}>
          {price.toLocaleString("ko-KR")}원 — 책 정보 보기
        </Link>
      </Button>
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
