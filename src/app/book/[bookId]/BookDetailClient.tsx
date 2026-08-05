"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Share2,
  Edit,
  Globe,
  Lock,
  FileText,
  Clock,
  List,
  ChevronDown,
  ChevronUp,
  Check,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import type { Book, Chapter } from "@/types";

interface BookDetailData {
  book: Book & { author_name?: string | null; price: number; is_free: boolean };
  chapters: Chapter[];
}

const LANGUAGE_LABELS: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
};

const GRADIENT_COLORS = [
  "from-blue-400 to-indigo-600",
  "from-purple-400 to-pink-600",
  "from-green-400 to-teal-600",
  "from-orange-400 to-red-600",
];

function getGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) & 0xffffffff;
  }
  return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
}

async function fetchBookDetail(bookId: string): Promise<BookDetailData> {
  const res = await fetch(`/api/books/${bookId}/detail`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("콘텐츠 정보를 불러오지 못했습니다.");
  const json = await res.json();
  return json.data;
}

async function togglePublish(bookId: string, publish: boolean): Promise<void> {
  const res = await fetch(`/api/books/${bookId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: publish ? "published" : "draft",
      visibility: publish ? "public" : "private",
    }),
  });
  if (!res.ok) throw new Error("상태 변경에 실패했습니다.");
}

export function BookDetailClient() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const viewAs = searchParams.get("viewAs");

  const [showAllChapters, setShowAllChapters] = useState(false);
  const [copied, setCopied] = useState(false);
  const [accessInfo, setAccessInfo] = useState<{
    hasAccess: boolean;
    reason: string;
  } | null>(null);

  const { data, isLoading, isError } = useQuery<BookDetailData>({
    queryKey: ["book-detail", bookId],
    queryFn: () => fetchBookDetail(bookId),
    enabled: !!bookId,
  });

  const publishMutation = useMutation({
    mutationFn: ({ publish }: { publish: boolean }) =>
      togglePublish(bookId, publish),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-detail", bookId] });
    },
  });

  useEffect(() => {
    if (!bookId) return;
    fetch(`/api/books/${bookId}/access`)
      .then((r) => r.json())
      .then((json) => setAccessInfo(json.data))
      .catch(() => {});
  }, [bookId]);

  const handleShare = async () => {
    const url = window.location.href;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="text-lg font-medium text-gray-700">
          콘텐츠를 불러올 수 없습니다
        </p>
        <p className="mt-1 text-sm text-gray-400">
          삭제됐거나 접근 권한이 없을 수 있습니다.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.back()}>
          돌아가기
        </Button>
      </div>
    );
  }

  const { book, chapters } = data;
  const isOwner = viewAs === "customer" ? false : user?.id === book.owner_id;
  const isPublished = book.status === "published";
  const readingMinutes = Math.max(1, Math.round(book.total_words / 200));
  const langLabel = LANGUAGE_LABELS[book.language] ?? book.language;
  const gradient = getGradient(book.title);
  const displayChapters = showAllChapters ? chapters : chapters.slice(0, 5);

  return (
    <div className="min-h-screen bg-white mx-auto max-w-5xl px-4 py-16 sm:px-6">
      {/* Book header */}
      <div className="flex flex-col gap-8 sm:flex-row">
        {/* Cover */}
        <div className="flex-shrink-0 self-start">
          <div className="relative h-72 w-48 overflow-hidden rounded-xl shadow-lg sm:h-80 sm:w-56">
            {book.cover_image_url ? (
              <Image
                src={book.cover_image_url}
                alt={book.title}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 192px, 224px"
                priority
              />
            ) : (
              <div
                className={cn(
                  "flex h-full w-full items-center justify-center bg-gradient-to-br",
                  gradient,
                )}
              >
                <span className="text-7xl font-bold text-white/80 select-none">
                  {book.title.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {langLabel}
            </span>
            {isPublished ? (
              <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                <Globe className="h-3 w-3" />
                공개
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                <Lock className="h-3 w-3" />
                비공개
              </span>
            )}
          </div>

          <h1 className="mb-1 font-logo text-2xl font-bold text-gray-900 sm:text-3xl">
            {book.title}
          </h1>

          {book.author_name && (
            <Link href={`/author/${book.owner_id}`} className="mb-3 inline-block text-sm text-gray-500 hover:text-gray-900 hover:underline">
              by {book.author_name}
            </Link>
          )}

          {book.description && (
            <p className="mb-4 text-sm leading-relaxed text-gray-600">
              {book.description}
            </p>
          )}

          {/* Stats */}
          <div className="mb-6 flex flex-wrap gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <List className="h-4 w-4 text-gray-400" />
              {book.total_chapters}챕터
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-gray-400" />
              {book.total_words.toLocaleString()}자
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-gray-400" />
              약 {readingMinutes}분
            </span>
          </div>

          {/* Price display */}
          {!isOwner && book.price > 0 && (
            <div className="mb-4">
              <span className="text-2xl font-bold text-gray-900">
                {book.price.toLocaleString("ko-KR")}원
              </span>
            </div>
          )}
          {!isOwner && book.price === 0 && (
            <div className="mb-4">
              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                무료
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {/* 소유자 */}
            {isOwner && (
              <>
                <Button asChild>
                  <Link href={`/reader/${book.id}`} className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    읽기
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href={`/create/edit/${book.id}`} className="flex items-center gap-2">
                    <Edit className="h-4 w-4" />
                    편집
                  </Link>
                </Button>
                <Button
                  variant={isPublished ? "secondary" : "default"}
                  isLoading={publishMutation.isPending}
                  onClick={() => publishMutation.mutate({ publish: !isPublished })}
                >
                  {isPublished ? "비공개로 전환" : "발행하기"}
                </Button>
              </>
            )}

            {/* 비소유자 - 접근 가능 (무료 또는 구매 완료) */}
            {!isOwner && accessInfo?.hasAccess && (
              <Button asChild>
                <Link href={`/reader/${book.id}`} className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  읽기
                </Link>
              </Button>
            )}

            {/* 비소유자 - 유료 미구매 */}
            {!isOwner && !accessInfo?.hasAccess && book.price > 0 && (
              <>
                <Button asChild>
                  <Link href={`/payments/checkout/${book.id}`} className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    구매하기
                  </Link>
                </Button>
                {/* 첫 챕터는 열려 있습니다. 소개글만 보고 결제를
                    결정하게 두면 대부분 결제하지 않습니다. */}
                {accessInfo?.reason === "preview" && (
                  <Button variant="outline" asChild>
                    <Link href={`/reader/${book.id}`} className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      첫 챕터 미리보기
                    </Link>
                  </Button>
                )}
              </>
            )}

            {/* 비소유자 - 무료 (accessInfo 로딩 전 fallback) */}
            {!isOwner && !accessInfo && book.price === 0 && (
              <Button asChild>
                <Link href={`/reader/${book.id}`} className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  읽기
                </Link>
              </Button>
            )}

            {/* 공유 */}
            <Button variant="outline" onClick={handleShare} className="flex items-center gap-2">
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  복사됨
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" />
                  공유
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-10 space-y-10">
        {/* Chapter list */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            목차 ({chapters.length}챕터)
          </h2>
          {chapters.length === 0 ? (
            <p className="text-sm text-gray-400">챕터가 없습니다.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              {displayChapters.map((chapter, idx) => (
                <div
                  key={chapter.id}
                  className={cn(
                    "flex items-center justify-between px-5 py-3.5 text-sm",
                    idx > 0 && "border-t border-gray-100",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex-shrink-0 text-xs font-medium text-gray-400 w-6">
                      {chapter.order_index + 1}
                    </span>
                    <span className="truncate font-medium text-gray-800">
                      {chapter.title}
                    </span>
                  </div>
                  <span className="flex-shrink-0 ml-4 text-xs text-gray-400">
                    {chapter.word_count.toLocaleString()}자
                  </span>
                </div>
              ))}
              {chapters.length > 5 && (
                <button
                  onClick={() => setShowAllChapters((v) => !v)}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-gray-100 py-3 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
                >
                  {showAllChapters ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      접기
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      {chapters.length - 5}개 더 보기
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </section>

        {/* Other books by this author */}
        <OtherBooksByAuthor currentBookId={book.id} authorId={book.owner_id} />
      </div>
    </div>
  );
}

function OtherBooksByAuthor({
  currentBookId,
  authorId,
}: {
  currentBookId: string;
  authorId: string;
}) {
  const { data: books } = useQuery<{ id: string; title: string; cover_image_url: string | null }[]>({
    queryKey: ["author-other-books", authorId, currentBookId],
    queryFn: async () => {
      const res = await fetch(
        `/api/explore?author_id=${encodeURIComponent(authorId)}&per_page=4`,
      );
      if (!res.ok) return [];
      const json = await res.json();
      const all: { id: string; title: string; cover_image_url: string | null }[] =
        json.data?.books ?? [];
      return all.filter((b) => b.id !== currentBookId);
    },
    staleTime: 60_000,
  });

  if (!books || books.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        이 저자의 다른 책
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {books.map((b) => {
          const gradient = getGradient(b.title);
          return (
            <Link
              key={b.id}
              href={`/book/${b.id}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm hover:-translate-y-2 hover:shadow-lg transition-all duration-300"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden">
                {b.cover_image_url ? (
                  <Image
                    src={b.cover_image_url}
                    alt={b.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, 25vw"
                  />
                ) : (
                  <div
                    className={cn(
                      "flex h-full w-full items-center justify-center bg-gradient-to-br",
                      gradient,
                    )}
                  >
                    <span className="text-4xl font-bold text-white/80 select-none">
                      {b.title.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-gray-700">
                  {b.title}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
