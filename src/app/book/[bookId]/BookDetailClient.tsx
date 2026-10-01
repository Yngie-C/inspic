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
  if (!res.ok) throw new Error("책 정보를 불러오지 못했어요.");
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

  const { data, isLoading, isError } = useQuery<BookDetailData>({
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

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-1 px-4 text-center">
        <p className="text-subtitle text-primary">책 정보를 불러올 수 없어요</p>
        <p className="text-body-sm text-muted">
          삭제됐거나 접근 권한이 없을 수 있어요.
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => router.back()}>
          돌아가기
        </Button>
      </div>
    );
  }

  const { book, chapters } = data;
  const isOwner = viewAs === "customer" ? false : user?.id === book.owner_id;

  return (
    <BookDetailView
      book={book}
      chapters={chapters}
      isOwner={isOwner}
      access={accessInfo}
      otherBooks={otherBooks}
      publishing={publishMutation.isPending}
      onTogglePublish={() =>
        publishMutation.mutate({ publish: book.status !== "published" })
      }
    />
  );
}
