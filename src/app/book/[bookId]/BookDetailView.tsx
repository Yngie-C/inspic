"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Share2 } from "lucide-react";
import { BookCover } from "@/components/ui/book-cover";
import { AuthorAvatar } from "@/components/ui/author-avatar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BookPreviewCard,
  type BookWithAuthor,
} from "@/components/explore/BookPreviewCard";
import type { PublishCheck } from "@/lib/publish-checks";
import type { Book, Chapter } from "@/types";

/**
 * 책 상세의 화면 부분 (DESIGN.md Layout "책 상세").
 * 데이터 로딩은 `BookDetailClient`가 하고, `/dev/book`은 목 데이터로 이 화면을 그린다.
 */

export type DetailBook = Book & {
  author_name?: string | null;
  author_bio?: string | null;
  author_about?: string | null;
  author_avatar_url?: string | null;
};

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
  /** [공개하기]가 서버 검수에 막혔을 때의 사유. */
  publishBlockers: PublishCheck[] | null;
  publishError: string | null;
  onPublish: () => void;
  onUnpublish: () => void;
}

const VISIBLE_CHAPTERS = 5;

export function BookDetailView({
  book,
  chapters,
  isOwner,
  access,
  otherBooks,
  publishing,
  publishBlockers,
  publishError,
  onPublish,
  onUnpublish,
}: Props) {
  const [showAllChapters, setShowAllChapters] = useState(false);
  // published여도 private이면 아무도 찾을 수 없습니다. 독자에게 보이는
  // 것은 둘이 함께일 때뿐입니다.
  const isPublished = book.status === "published" && book.visibility === "public";
  const isPreviewOnly = !isOwner && access?.reason === "preview";
  const displayChapters = showAllChapters
    ? chapters
    : chapters.slice(0, VISIBLE_CHAPTERS);
  const audience = audienceLines(book.audience);

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

          <Facts book={book} owned={!isOwner && book.price > 0 && !!access?.hasAccess} />

          {/* 모바일: 주요 버튼은 한 줄 전체, 보조 버튼은 그 아래에 나눠 둔다. 오류 문장은 버튼 규칙에서 뺀다. */}
          <div className="mt-1 flex flex-wrap gap-2 max-[600px]:[&>:is(a,button)]:flex-1 max-[600px]:[&>:first-child]:basis-full">
            <Actions
              book={book}
              isOwner={isOwner}
              isPublished={isPublished}
              access={access}
              publishing={publishing}
              publishBlockers={publishBlockers}
              publishError={publishError}
              onPublish={onPublish}
              onUnpublish={onUnpublish}
            />
            <ShareButton />
          </div>
        </div>
      </div>

      {(book.description || book.detail_image_url) && (
        <section>
          <h2 className="mb-3.5 text-label text-muted">책 소개</h2>
          {book.description && (
            <p className="max-w-[640px] whitespace-pre-line text-body-reader text-primary">
              {book.description}
            </p>
          )}
          {/* 저자가 고른 소개 이미지 한 장. 세로로 긴 이미지는 자르지 않고 그대로 둔다. */}
          {book.detail_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.detail_image_url}
              alt={book.detail_image_alt || `${book.title} 소개 이미지`}
              loading="lazy"
              className={cn("block h-auto w-full max-w-[640px]", book.description && "mt-6")}
            />
          )}
        </section>
      )}

      {audience.length > 0 && (
        <section>
          <h2 className="mb-3.5 text-label text-muted">이런 분께</h2>
          <ul className="max-w-[640px] border-t border-line">
            {audience.map((line, i) => (
              <li key={i} className="border-b border-line py-[11px] text-body text-primary">
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3.5 text-label text-muted">목차</h2>
        {chapters.length === 0 ? (
          <p className="text-body-sm text-muted">아직 공개된 장이 없어요.</p>
        ) : (
          <>
            <ol className="border-t border-line">
              {displayChapters.map((chapter, i) => (
                <li
                  key={chapter.id}
                  className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-baseline gap-2 border-b border-line py-[11px] text-body tabular-nums"
                >
                  {/* order_index는 draft 장 자리까지 세어 독자에게는 번호가 건너뜁니다. */}
                  <span className="text-caption text-muted">{i + 1}</span>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate">{chapter.title}</span>
                    {isPreviewOnly && i === 0 && (
                      <span className="shrink-0 text-caption font-semibold text-info">
                        미리보기
                      </span>
                    )}
                  </span>
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

      {/* "해 본 사람"이 누구인지는 이 책을 고르는 이유입니다. 소개가 없어도
          저자 페이지로 가는 길은 남깁니다. */}
      {book.author_name && (
        <section>
          <h2 className="mb-3.5 text-label text-muted">지은이</h2>
          <div className="flex max-w-[640px] flex-col gap-3">
            <div className="flex items-center gap-3">
              <AuthorAvatar name={book.author_name} url={book.author_avatar_url} size="sm" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-subtitle text-primary">{book.author_name}</p>
                {book.author_bio && (
                  <p className="text-body-sm text-muted">{book.author_bio}</p>
                )}
              </div>
            </div>
            {book.author_about && (
              <p className="line-clamp-4 whitespace-pre-line text-body text-primary">
                {book.author_about}
              </p>
            )}
            <Link
              href={`/author/${book.owner_id}`}
              className="self-start text-body-sm text-muted underline decoration-1 underline-offset-3 hover:text-primary"
            >
              저자 페이지 보기
            </Link>
          </div>
        </section>
      )}

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

/** "이런 분께"는 한 줄에 한 사람이다. 빈 줄은 버린다. */
function audienceLines(audience: string | null | undefined): string[] {
  if (!audience) return [];
  return audience
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * 사실 정보: 위아래 1px 선 사이의 한 줄.
 * 산 책이면 가격 대신 보유 상태를 쓴다. 버튼 이름만으로는 산 책인지 읽히지 않는다.
 */
function Facts({ book, owned }: { book: DetailBook; owned: boolean }) {
  const minutes = Math.max(1, Math.round(book.total_words / 200));
  const readingTime =
    minutes < 60 ? `약 ${minutes}분` : `약 ${Math.round(minutes / 6) / 10}시간`;
  const facts = [
    ["읽는 시간", readingTime],
    ["구성", `${book.total_chapters}장`],
    owned
      ? ["구매", "보유 중"]
      : ["가격", book.price > 0 ? `${book.price.toLocaleString("ko-KR")}원` : "무료"],
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
  publishBlockers,
  publishError,
  onPublish,
  onUnpublish,
}: {
  book: DetailBook;
  isOwner: boolean;
  isPublished: boolean;
  access: DetailAccess | null;
  publishing: boolean;
  publishBlockers: PublishCheck[] | null;
  publishError: string | null;
  onPublish: () => void;
  onUnpublish: () => void;
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
        {/* 바로 공개합니다. 서버 검수에 막히면 사유를 버튼 아래에 띄우고
            편집 화면으로 안내합니다. */}
        {isPublished ? (
          <Button variant="secondary" isLoading={publishing} onClick={onUnpublish}>
            비공개로 전환
          </Button>
        ) : (
          <Button variant="secondary" isLoading={publishing} onClick={onPublish}>
            공개하기
          </Button>
        )}
        {publishError && (
          <p role="alert" className="basis-full text-body-sm text-danger">
            {publishError}
          </p>
        )}
        {publishBlockers && publishBlockers.length > 0 && (
          <div role="alert" className="basis-full">
            <p className="text-body-sm font-semibold text-danger">
              공개하려면 고쳐야 할 곳이 있어요
            </p>
            <ul className="mt-1 space-y-1">
              {publishBlockers.map((check) => (
                <li key={check.id} className="text-caption leading-relaxed text-danger">
                  <span className="font-medium">{check.title}</span> — {check.detail}
                </li>
              ))}
            </ul>
            <Link
              href={`/create/edit/${book.id}`}
              className="mt-1.5 inline-block text-body-sm font-medium text-primary underline underline-offset-2"
            >
              편집으로 가서 고치기
            </Link>
          </div>
        )}
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
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  const copied = result === "copied";

  const handleShare = async () => {
    // 일부 인앱 브라우저는 clipboard가 없거나 거절한다. 조용히 끝내지 않는다.
    const copiedOk = await Promise.resolve()
      .then(() => navigator.clipboard.writeText(window.location.href))
      .then(() => true)
      .catch(() => false);
    setResult(copiedOk ? "copied" : "failed");
    if (copiedOk) setTimeout(() => setResult(null), 2000);
  };

  return (
    <>
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
    {result === "failed" && (
      <p role="alert" className="basis-full text-body-sm text-danger">
        링크를 복사하지 못했어요. 주소창의 주소를 직접 복사해 주세요.
      </p>
    )}
    </>
  );
}
