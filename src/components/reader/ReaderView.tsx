"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, List, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Book, Chapter } from "@/types";
import type { AccessReason } from "@/lib/access-control";
import { cn } from "@/lib/utils";
import { HtmlContentRenderer } from "./HtmlContentRenderer";
import { SaveStatusBadge } from "./SaveStatusBadge";

/**
 * 리더의 화면 부분. 데이터 로딩과 접근 판정은 `app/reader/[bookId]/page.tsx`가
 * 하고, 여기서는 받은 책을 그립니다. `WorkbookResponsesProvider` 안에서
 * 그려야 합니다.
 *
 * 페이지에서 떼어 둔 것은 `/dev/reader`에서 목 데이터로 같은 화면을
 * 검증하기 위해서입니다.
 */

export interface ReaderBook extends Book {
  chapters: Chapter[];
}

export interface AccessInfo {
  hasAccess: boolean;
  reason: AccessReason;
  canRead: boolean;
  canSaveResponses: boolean;
}

export function ReaderView({
  book,
  access,
  isLoggedIn,
  initialIndex = 0,
}: {
  book: ReaderBook;
  access: AccessInfo;
  isLoggedIn: boolean;
  /** 처음 펼칠 장. 검증 페이지에서 블록이 있는 장을 바로 열 때 쓴다. */
  initialIndex?: number;
}) {
  const router = useRouter();
  const chapters = book.chapters;

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [tocOpen, setTocOpen] = useState(false);

  const currentChapter = chapters[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === chapters.length - 1;
  const isPreview = access.reason === "preview";
  const backHref = isLoggedIn ? "/my/library" : "/explore";
  const progress = ((currentIndex + 1) / chapters.length) * 100;

  const goTo = (index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, chapters.length - 1)));
    setTocOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toc = (
    <ChapterList
      chapters={chapters}
      currentIndex={currentIndex}
      onSelect={goTo}
    />
  );

  return (
    <div className="min-h-screen bg-paper text-primary">
      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-paper px-4 min-[601px]:px-6">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="-ml-1.5 rounded-md p-1.5 text-primary transition-colors duration-150 ease-out hover:bg-mark"
          aria-label={isLoggedIn ? "내 서재로" : "둘러보기로"}
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        <p className="min-w-0 flex-1 truncate text-body-sm text-muted max-[600px]:text-caption">
          {book.title}
          {currentChapter && (
            <span className="max-[600px]:hidden"> · {currentChapter.title}</span>
          )}
        </p>
        <SaveStatusBadge isPreview={isPreview} />
        <button
          type="button"
          onClick={() => setTocOpen(!tocOpen)}
          className="rounded-md p-1.5 text-primary transition-colors duration-150 ease-out hover:bg-mark min-[601px]:hidden"
          aria-label="목차"
          aria-expanded={tocOpen}
        >
          <List className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        <span
          aria-hidden="true"
          className="absolute bottom-[-1px] left-0 h-0.5 bg-accent transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </header>

      <div className="grid min-[601px]:grid-cols-[248px_minmax(0,1fr)]">
        {/* 선은 열 전체 높이로, 목차는 화면에 붙어 따라온다. */}
        <div className="border-r border-line max-[600px]:hidden">
          <aside className="sticky top-12 max-h-[calc(100vh-3rem)] overflow-y-auto px-4 py-6">
            {toc}
          </aside>
        </div>

        {tocOpen && (
          <div className="fixed inset-0 z-40 min-[601px]:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-[rgba(0,0,0,0.4)]"
              aria-label="목차 닫기"
              onClick={() => setTocOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-[min(304px,85vw)] overflow-y-auto border-r border-line bg-paper px-4 py-4 shadow-float">
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setTocOpen(false)}
                  className="rounded-md p-1.5 text-primary hover:bg-mark"
                  aria-label="목차 닫기"
                >
                  <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </button>
              </div>
              {toc}
            </aside>
          </div>
        )}

        <main className="px-14 pb-20 pt-12 max-[600px]:px-4 max-[600px]:pb-14 max-[600px]:pt-7">
          <div className="max-w-[38em] text-body-reader">
            {!access.canSaveResponses && (
              <UnsavedNotice
                bookId={book.id}
                isPreview={isPreview}
                isLoggedIn={isLoggedIn}
              />
            )}

            {currentChapter && (
              <>
                <p className="mb-2 text-caption font-semibold text-muted">
                  {currentIndex + 1}장
                  {currentChapter.estimated_reading_time
                    ? ` · 약 ${currentChapter.estimated_reading_time}분`
                    : null}
                </p>
                <h1 className="mb-8 text-display text-balance text-primary max-[600px]:text-[25px]">
                  {currentChapter.title}
                </h1>
                <HtmlContentRenderer html={currentChapter.content_html} />
              </>
            )}

            {isPreview ? (
              <PreviewEnd bookId={book.id} price={book.price} />
            ) : (
              <nav
                aria-label="장 이동"
                className="mt-16 flex items-center justify-between gap-3 border-t border-line pt-8"
              >
                <Button
                  variant="secondary"
                  onClick={() => goTo(currentIndex - 1)}
                  disabled={isFirst}
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                  이전 장
                </Button>
                <span className="text-caption tabular-nums text-muted">
                  {currentIndex + 1} / {chapters.length}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => goTo(currentIndex + 1)}
                  disabled={isLast}
                >
                  다음 장
                  <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </nav>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/** 목차. 현재 장은 mark 면 + 600, 번호는 accent. */
function ChapterList({
  chapters,
  currentIndex,
  onSelect,
}: {
  chapters: Chapter[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="목차">
      <p className="mx-2 mb-2.5 text-label text-muted">목차</p>
      <ol className="flex flex-col gap-0.5">
        {chapters.map((chapter, index) => {
          const current = index === currentIndex;
          return (
            <li key={chapter.id}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "grid w-full grid-cols-[20px_1fr] gap-1.5 rounded-sm px-2 py-[7px] text-left text-body-sm tabular-nums transition-colors duration-150 ease-out",
                  current ? "bg-mark font-semibold" : "hover:bg-mark",
                )}
              >
                <span className={current ? "text-primary" : "text-muted"}>
                  {index + 1}
                </span>
                <span>{chapter.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
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
        title: "미리보기로 읽고 있어요",
        description:
          "여기에 쓴 답은 이 기기에만 남아요. 구매하면 계정에 저장되고 다른 기기에서 이어서 쓸 수 있어요.",
        href: `/book/${bookId}`,
        label: "책 정보 보기",
      }
    : isLoggedIn
      ? {
          title: "답이 이 기기에만 남아요",
          description:
            "이 책에서는 답을 계정에 저장할 수 없어요. 책 정보에서 이용 상태를 확인해 주세요.",
          href: `/book/${bookId}`,
          label: "책 정보 보기",
        }
      : {
          title: "답이 이 기기에만 남아요",
          description:
            "로그인하면 지금까지 쓴 답이 계정에 저장되고, 다른 기기에서 이어서 쓸 수 있어요.",
          href: `/auth/login?redirect=/reader/${bookId}`,
          label: "로그인",
        };

  return (
    // 미리보기는 예정된 상태라 info, 로컬에만 남는 답은 잃을 수 있어 warning이다.
    // 박스는 입력 블록 전용이라(DESIGN.md) 안내는 message처럼 색 글자와 아래 선만 둔다.
    <div className="mb-10 flex flex-col items-start gap-2 border-b border-line pb-6">
      <p
        className={cn(
          "text-body-sm font-semibold",
          isPreview ? "text-info" : "text-warning",
        )}
      >
        {title}
      </p>
      <p className="text-body-sm text-muted">{description}</p>
      <Button asChild variant="secondary" size="sm" className="mt-1">
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}

/** 미리보기 챕터의 끝. 다음 챕터 대신 구매로 이어집니다. */
function PreviewEnd({ bookId, price }: { bookId: string; price: number }) {
  return (
    <div className="mt-16 flex flex-col items-start gap-2 border-t border-line pt-8">
      <p className="text-subtitle text-primary">미리보기는 여기까지예요</p>
      <p className="text-body-sm text-muted">
        구매하면 나머지 장을 읽고, 쓴 답을 계정에 저장할 수 있어요.
      </p>
      <Button asChild className="mt-3">
        <Link href={`/book/${bookId}`}>
          {price.toLocaleString("ko-KR")}원 · 책 정보 보기
        </Link>
      </Button>
    </div>
  );
}

export function ReaderNotice({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: { href: string; label: string } | { onClick: () => void; label: string };
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
      <h1 className="text-title text-primary">{title}</h1>
      <p className="max-w-sm text-body-sm text-muted">{description}</p>
      {"href" in action ? (
        <Button asChild variant="secondary" className="mt-2">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : (
        <Button variant="secondary" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
