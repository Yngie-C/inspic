"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Share2 } from "lucide-react";
import { BookCover } from "@/components/ui/book-cover";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BookPreviewCard,
  type BookWithAuthor,
} from "@/components/explore/BookPreviewCard";
import type { Book, Chapter } from "@/types";

/**
 * 책 상세의 화면 부분 (DESIGN.md Layout "책 상세").
 * 데이터 로딩은 `BookDetailClient`가 하고, `/dev/book`은 목 데이터로 이 화면을 그린다.
 */

export type DetailBook = Book & { author_name?: string | null };

export interface DetailAccess {
  hasAccess: boolean;
  reason: string;
}

interface Props {
  book: DetailBook;
  chapters: Chapter[];
  isOwner: boolean;
  /** 접근 판정. 불러오기 전이면 null. */
  access: DetailAccess | null;
  otherBooks: BookWithAuthor[];
  publishing: boolean;
  onTogglePublish: () => void;
}

const VISIBLE_CHAPTERS = 5;

export function BookDetailView({
  book,
  chapters,
  isOwner,
  access,
  otherBooks,
  publishing,
  onTogglePublish,
}: Props) {
  const [showAllChapters, setShowAllChapters] = useState(false);
  const isPublished = book.status === "published";
  const displayChapters = showAllChapters
    ? chapters
    : chapters.slice(0, VISIBLE_CHAPTERS);

  return (
    <div className="mx-auto flex max-w-[936px] flex-col gap-12 px-4 pb-16 pt-6 min-[601px]:px-6 min-[601px]:pt-12">
      <div className="grid gap-5 min-[601px]:grid-cols-[220px_minmax(0,1fr)] min-[601px]:gap-10">
        <div className="relative aspect-[3/4] w-[156px] overflow-hidden rounded-sm border border-primary/10 min-[601px]:w-full">
          <BookCover
            bookId={book.id}
            title={book.title}
            coverImageUrl={book.cover_image_url}
            sizes="(max-width: 600px) 156px, 220px"
            size="lg"
            priority
          />
        </div>

        <div className="flex max-w-[640px] flex-col gap-3.5">
          {isOwner && (
            <p className="flex items-center gap-1.5 text-caption font-semibold text-primary">
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isPublished ? "bg-success" : "bg-faint",
                )}
              />
              {isPublished ? "공개 중" : "비공개 · 나만 볼 수 있음"}
            </p>
          )}
          <div className="flex flex-col gap-1">
            <h1 className="text-display text-balance text-primary max-[600px]:text-[25px]">
              {book.title}
            </h1>
            {book.author_name && (
              <Link
                href={`/author/${book.owner_id}`}
                className="self-start text-body-sm text-muted decoration-1 underline-offset-3 hover:underline"
              >
                {book.author_name} 지음
              </Link>
            )}
          </div>

          <Facts book={book} />

          {book.description && (
            <p className="whitespace-pre-line text-[16px] leading-[1.75] text-primary">
              {book.description}
            </p>
          )}

          {/* 모바일: 주요 버튼은 한 줄 전체, 보조 버튼은 그 아래에 나눠 둔다. */}
          <div className="mt-1 flex flex-wrap gap-2 max-[600px]:[&>*]:flex-1 max-[600px]:[&>:first-child]:basis-full">
            <Actions
              book={book}
              isOwner={isOwner}
              isPublished={isPublished}
              access={access}
              publishing={publishing}
              onTogglePublish={onTogglePublish}
            />
            <ShareButton />
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3.5 text-label text-muted">목차</h2>
        {chapters.length === 0 ? (
          <p className="text-body-sm text-muted">아직 공개된 장이 없습니다.</p>
        ) : (
          <>
            <ol className="border-t border-line">
              {displayChapters.map((chapter) => (
                <li
                  key={chapter.id}
                  className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-baseline gap-2 border-b border-line py-[11px] text-body tabular-nums"
                >
                  <span className="text-caption text-muted">
                    {chapter.order_index + 1}
                  </span>
                  <span className="truncate">{chapter.title}</span>
                  <span className="text-caption text-muted">
                    {chapter.estimated_reading_time
                      ? `${chapter.estimated_reading_time}분`
                      : `${chapter.word_count.toLocaleString()}자`}
                  </span>
                </li>
              ))}
            </ol>
            {chapters.length > VISIBLE_CHAPTERS && (
              <Button
                variant="link"
                size="sm"
                className="mt-2 px-0"
                onClick={() => setShowAllChapters((v) => !v)}
                aria-expanded={showAllChapters}
              >
                {showAllChapters
                  ? "접기"
                  : `${chapters.length - VISIBLE_CHAPTERS}개 더 보기`}
              </Button>
            )}
          </>
        )}
      </section>

      {otherBooks.length > 0 && (
        <section>
          <h2 className="mb-3.5 text-label text-muted">이 저자의 다른 책</h2>
          {/* 본 표지(220px)보다 작게 둬서 위계를 지킨다. */}
          <div className="grid grid-cols-3 gap-4 min-[601px]:grid-cols-[repeat(4,144px)] min-[601px]:gap-6">
            {otherBooks.slice(0, 4).map((b) => (
              <BookPreviewCard
                key={b.id}
                book={b}
                size="sm"
                className="max-[600px]:[&:nth-child(4)]:hidden"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** 사실 정보: 위아래 1px 선 사이의 한 줄. */
function Facts({ book }: { book: DetailBook }) {
  const minutes = Math.max(1, Math.round(book.total_words / 200));
  const readingTime =
    minutes < 60 ? `약 ${minutes}분` : `약 ${Math.round(minutes / 6) / 10}시간`;
  const facts = [
    ["읽는 시간", readingTime],
    ["구성", `${book.total_chapters}장`],
    ["가격", book.price > 0 ? `${book.price.toLocaleString("ko-KR")}원` : "무료"],
  ];

  return (
    <dl className="my-1 flex flex-wrap gap-x-[18px] gap-y-1.5 border-y border-line py-3 text-body-sm text-muted">
      {facts.map(([label, value]) => (
        <div key={label} className="flex gap-1.5">
          <dt>{label}</dt>
          <dd className="font-semibold text-primary tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 주요 행동은 accent 버튼 하나다. 나머지는 secondary. */
function Actions({
  book,
  isOwner,
  isPublished,
  access,
  publishing,
  onTogglePublish,
}: {
  book: DetailBook;
  isOwner: boolean;
  isPublished: boolean;
  access: DetailAccess | null;
  publishing: boolean;
  onTogglePublish: () => void;
}) {
  const readHref = `/reader/${book.id}`;

  if (isOwner) {
    return (
      <>
        <Button asChild>
          <Link href={readHref}>읽기</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href={`/create/edit/${book.id}`}>편집</Link>
        </Button>
        <Button variant="secondary" isLoading={publishing} onClick={onTogglePublish}>
          {isPublished ? "비공개로 전환" : "발행하기"}
        </Button>
      </>
    );
  }

  // 무료 책은 판정을 불러오기 전에도 읽기를 보여 준다.
  if (access?.hasAccess || (!access && book.price === 0)) {
    return (
      <Button asChild>
        <Link href={readHref}>읽기</Link>
      </Button>
    );
  }

  if (book.price > 0) {
    return (
      <>
        <Button asChild>
          <Link href={`/payments/checkout/${book.id}`}>
            {book.price.toLocaleString("ko-KR")}원에 구매하기
          </Link>
        </Button>
        {/* 첫 챕터는 열려 있습니다. 소개글만 보고 결제를
            결정하게 두면 대부분 결제하지 않습니다. */}
        {access?.reason === "preview" && (
          <Button variant="secondary" asChild>
            <Link href={readHref}>첫 장 미리보기</Link>
          </Button>
        )}
      </>
    );
  }

  return null;
}

function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const copiedOk = await navigator.clipboard
      .writeText(window.location.href)
      .then(() => true)
      .catch(() => false);
    if (!copiedOk) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="secondary" onClick={handleShare}>
      {copied ? (
        <>
          <Check className="h-4 w-4 text-success" strokeWidth={1.75} />
          링크를 복사했어요
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" strokeWidth={1.75} />
          공유
        </>
      )}
    </Button>
  );
}
