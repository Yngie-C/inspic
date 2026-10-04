"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { BookWithAuthor } from "@/components/explore/BookPreviewCard";
import { useAuthStore } from "@/stores/auth-store";
import type { Chapter } from "@/types";
import {
  BookDetailView,
  type DetailAccess,
  type DetailBook,
} from "./BookDetailView";

interface BookDetailData {
  book: DetailBook;
  chapters: Chapter[];
}

async function fetchBookDetail(bookId: string): Promise<BookDetailData> {
  const res = await fetch(`/api/books/${bookId}/detail`, {
    credentials: "include",
  });
  if (!res.ok) throw new BookDetailError(res.status);
  const json = await res.json();
  return json.data;
}

/** 없는 책(404)과 불러오지 못한 것(5xx)은 독자에게 다른 안내입니다. */
class BookDetailError extends Error {
  constructor(readonly status: number) {
    super("책 정보를 불러오지 못했어요.");
  }
}

/** 공개는 검수 화면(`/create/preview`)에서 합니다. 여기서는 내리기만. */
async function unpublish(bookId: string): Promise<void> {
  const res = await fetch(`/api/books/${bookId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "draft", visibility: "private" }),
  });
  if (!res.ok) throw new Error("상태를 바꾸지 못했어요.");
}

export function BookDetailClient() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const viewAs = searchParams.get("viewAs");

  const [accessInfo, setAccessInfo] = useState<DetailAccess | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<BookDetailData>({
    queryKey: ["book-detail", bookId],
    queryFn: () => fetchBookDetail(bookId),
    enabled: !!bookId,
  });

  const authorId = data?.book.owner_id;
  const { data: otherBooks = [] } = useQuery<BookWithAuthor[]>({
    queryKey: ["author-other-books", authorId, bookId],
    queryFn: async () => {
      const res = await fetch(
        `/api/explore?author_id=${encodeURIComponent(authorId!)}&per_page=4`,
      );
      if (!res.ok) return [];
      const json = await res.json();
      const all: BookWithAuthor[] = json.data?.books ?? [];
      return all.filter((b) => b.id !== bookId);
    },
    enabled: !!authorId,
    staleTime: 60_000,
  });

  const publishMutation = useMutation({
    mutationFn: () => unpublish(bookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-detail", bookId] });
    },
  });

  useEffect(() => {
    if (!bookId) return;
    // 판정 실패(5xx)는 접근 정보 없음으로 둡니다. 실패 응답을 그대로
    // 넣으면 산 독자에게 구매 버튼이 뜹니다.
    fetch(`/api/books/${bookId}/access`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json) setAccessInfo(json.data);
      })
      .catch(() => {});
  }, [bookId]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !data) {
    // 일시 장애를 "삭제됐거나 권한 없음"으로 안내하면 산 독자가 책을 잃은 줄 압니다.
    const notFound = error instanceof BookDetailError && error.status === 404;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-1 px-4 text-center">
        <p className="text-subtitle text-primary">책 정보를 불러올 수 없어요</p>
        <p className="text-body-sm text-muted">
          {notFound
            ? "삭제됐거나 접근 권한이 없을 수 있어요."
            : "잠시 뒤 다시 시도해 주세요."}
        </p>
        {notFound ? (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => router.back()}>
            돌아가기
          </Button>
        ) : (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
            다시 시도
          </Button>
        )}
      </div>
    );
  }

  const { book } = data;
  const viewingAsCustomer = viewAs === "customer";
  const isOwner = viewingAsCustomer ? false : user?.id === book.owner_id;
  // 서버는 세션으로 소유자를 판정해 draft 장까지 보냅니다. 독자 화면으로
  // 볼 때는 독자가 받는 것처럼 published 장만 그립니다(코드 리뷰 7-P2-8).
  const chapters = viewingAsCustomer
    ? data.chapters.filter((chapter) => chapter.status === "published")
    : data.chapters;

  return (
    <BookDetailView
      book={book}
      chapters={chapters}
      isOwner={isOwner}
      access={accessInfo}
      otherBooks={otherBooks}
      publishing={publishMutation.isPending}
      onUnpublish={() => publishMutation.mutate()}
    />
  );
}
