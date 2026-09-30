"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
import {
  ReaderNotice,
  ReaderView,
  type AccessInfo,
  type ReaderBook,
} from "@/components/reader/ReaderView";
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
      <div className="flex min-h-screen items-center justify-center bg-paper text-muted">
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
