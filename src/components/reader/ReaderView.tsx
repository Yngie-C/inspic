"use client";

import { Fragment, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Element } from "html-react-parser";
import { ArrowLeft, ChevronLeft, ChevronRight, List, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Book, Chapter } from "@/types";
import type { AccessReason } from "@/lib/access-control";
import { cn } from "@/lib/utils";
import { BlockSheet } from "./paged/BlockSheet";
import { PagedContentRenderer } from "./paged/PagedContentRenderer";
import {
  keyTurn,
  startsOnControl,
  swipeTurn,
  tapTurn,
  type TouchPoint,
  type TurnDirection,
} from "./paged/turn-input";
import { usePagedColumns } from "./paged/usePagedColumns";
import { bookHref, loginHref } from "./reader-links";
import { SaveStatusBadge } from "./SaveStatusBadge";
import "./paged/paged.css";

/**
 * 리더의 화면 부분. 데이터 로딩과 접근 판정은 `app/reader/[bookId]/page.tsx`가
 * 하고, 여기서는 받은 책을 그립니다. `WorkbookResponsesProvider` 안에서
 * 그려야 합니다.
 *
 * 본문은 쪽으로 나눠 넘깁니다(2026-10-22 결정, C안). 쪽 안의 워크북 블록은
 * 카드이고 쓰기는 시트에서 합니다 — `docs/agent-knowledge/paged-reader-decision.md`.
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

  // 현재 장은 ID로 기억합니다. 순번만 들고 있으면 다시 받은 목록에서 장이
  // 줄거나 순서가 바뀔 때 빈 화면이 되거나 조용히 다른 장으로 넘어갑니다.
  // 그 장이 사라졌으면 있던 자리에서 가장 가까운 장을 엽니다.
  const [position, setPosition] = useState(() => ({
    id: chapters[initialIndex]?.id ?? null,
    index: initialIndex,
  }));
  const [tocOpen, setTocOpen] = useState(false);
  const [sheet, setSheet] = useState<Element | null>(null);

  const foundIndex = chapters.findIndex((chapter) => chapter.id === position.id);
  const currentIndex =
    foundIndex >= 0
      ? foundIndex
      : Math.max(0, Math.min(position.index, chapters.length - 1));
  const currentChapter = chapters[currentIndex];
  // 미리보기는 그 장 하나입니다. 끝에 구매 안내(PreviewEnd)가 있습니다.
  const isPreview = access.reason === "preview";
  const isFirst = isPreview || currentIndex === 0;
  const isLast = isPreview || currentIndex >= chapters.length - 1;
  const backHref = isLoggedIn ? "/my/library" : "/explore";
  const progress = ((currentIndex + 1) / chapters.length) * 100;

  // 돌려받은 객체를 그대로 들고 다니면 React Compiler가 ref 접근으로 봅니다.
  const { clipRef, columnsRef, page, total, next, prev, first, startAt } =
    usePagedColumns({ contentKey: currentChapter?.id ?? "" });

  const openChapter = useCallback(
    (index: number, where: "first" | "last") => {
      const target = Math.max(0, Math.min(index, chapters.length - 1));
      startAt(where);
      setPosition({ id: chapters[target]?.id ?? null, index: target });
    },
    [chapters, startAt],
  );

  const turn = useCallback(
    (direction: TurnDirection) => {
      if (direction === "forward") {
        if (next() || isLast) return;
        openChapter(currentIndex + 1, "first");
      } else {
        if (prev() || isFirst) return;
        openChapter(currentIndex - 1, "last");
      }
    },
    [currentIndex, isFirst, isLast, next, openChapter, prev],
  );

  const selectChapter = (index: number) => {
    // 지금 장을 다시 고르면 본문이 그대로라 다시 재지 않습니다. 첫 쪽으로만.
    if (index === currentIndex) first();
    else openChapter(index, "first");
    setTocOpen(false);
  };

  // 화살표 키. 입력 중·한글 조합 중이거나 시트·목차가 떠 있으면 넘기지 않습니다.
  // 리스너는 한 번만 붙이고 최신 상태는 effect event로 읽습니다.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const direction = keyTurn(event, sheet !== null || tocOpen);
    if (!direction) return;
    event.preventDefault();
    turn(direction);
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 모바일 목차를 연 채 넓히면 오버레이는 CSS로 숨지만 `tocOpen`이 남아 쪽
  // 넘김 키가 전부 막힙니다. 데스크톱 폭이 되면 닫습니다.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 601px)");
    const onChange = () => {
      if (wide.matches) setTocOpen(false);
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  // 본문 좌우 20% 탭. 카드·버튼·링크 위와 글을 고르는 중에는 넘기지 않습니다.
  // 비율은 `<main>`이 아니라 본문 폭 기준입니다 — 데스크톱의 `<main>`은 본문보다
  // 넓어 본문 앞부분 클릭이 이전 쪽이 됩니다. 본문 밖 여백은 그쪽 방향입니다.
  const onClick = (event: React.MouseEvent<HTMLElement>) => {
    if (startsOnControl(event.target)) return;
    if (window.getSelection()?.toString().trim()) return;
    const clip = clipRef.current;
    if (!clip) return;
    const rect = clip.getBoundingClientRect();
    if (rect.width === 0) return;
    const direction = tapTurn((event.clientX - rect.left) / rect.width);
    if (direction) turn(direction);
  };

  const touch = useRef<TouchPoint | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    const start = event.touches[0];
    touch.current =
      event.touches.length === 1 && !startsOnControl(event.target)
        ? { x: start.clientX, y: start.clientY, t: Date.now() }
        : null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    const end = event.changedTouches[0];
    if (!start || !end) return;
    const direction = swipeTurn(start, {
      x: end.clientX,
      y: end.clientY,
      t: Date.now(),
    });
    if (direction) turn(direction);
  };

  const closeSheet = useCallback(() => setSheet(null), []);

  const toc = (
    <ChapterList
      chapters={chapters}
      currentIndex={currentIndex}
      onSelect={selectChapter}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-primary">
      <header className="relative flex h-12 flex-none items-center gap-3 border-b border-line bg-paper px-4 min-[601px]:px-6">
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
        <SaveStatusBadge />
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

      {/* 열을 minmax(0,1fr)로 묶어야 합니다. auto면 다단 본문의 폭이 열을 밀어 쪽이 화면보다 넓어집니다. */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] min-[601px]:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="overflow-y-auto border-r border-line px-4 py-6 max-[600px]:hidden">
          {toc}
        </aside>

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

        <div className="flex min-h-0 flex-col">
          <main
            className="min-h-0 flex-1 px-14 pb-6 pt-12 max-[600px]:px-4 max-[600px]:pb-4 max-[600px]:pt-7"
            onClick={onClick}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div ref={clipRef} className="h-full max-w-[38em] overflow-hidden">
              <div ref={columnsRef} className="paged-columns h-full text-body-reader">
                {!access.canSaveResponses && (
                  <UnsavedNotice
                    bookId={book.id}
                    isPreview={isPreview}
                    isLoggedIn={isLoggedIn}
                  />
                )}

                {/* 장마다 key를 둡니다. 없으면 html-react-parser의 순번 key로 DOM이 재사용돼
                    옛 장의 기준 요소가 새 장에 붙은 채 남습니다. */}
                {currentChapter && (
                  <Fragment key={currentChapter.id}>
                    <header>
                      <p className="mb-2 text-caption font-semibold text-muted">
                        {currentIndex + 1}장
                        {currentChapter.estimated_reading_time
                          ? ` · 약 ${currentChapter.estimated_reading_time}분`
                          : null}
                      </p>
                      <h1 className="mb-8 text-display text-balance text-primary max-[600px]:text-[25px]">
                        {currentChapter.title}
                      </h1>
                    </header>
                    <PagedContentRenderer
                      html={currentChapter.content_html}
                      onOpenBlock={setSheet}
                    />
                  </Fragment>
                )}

                {isPreview && (
                  <PreviewEnd
                    bookId={book.id}
                    price={book.price}
                    isLoggedIn={isLoggedIn}
                  />
                )}
              </div>
            </div>
          </main>

          <nav
            aria-label="쪽 이동"
            className="flex h-12 flex-none items-center justify-between gap-3 border-t border-line px-4 min-[601px]:px-6"
          >
            <button
              type="button"
              onClick={() => turn("back")}
              disabled={isFirst && page === 0}
              className="rounded-md p-1.5 text-primary transition-colors duration-150 ease-out hover:bg-mark disabled:text-faint disabled:hover:bg-transparent"
              aria-label="이전 쪽"
            >
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
            <p className="m-0 text-caption tabular-nums text-muted">
              {currentIndex + 1}장 · {page + 1} / {total}쪽
            </p>
            <button
              type="button"
              onClick={() => turn("forward")}
              disabled={isLast && page >= total - 1}
              className="rounded-md p-1.5 text-primary transition-colors duration-150 ease-out hover:bg-mark disabled:text-faint disabled:hover:bg-transparent"
              aria-label="다음 쪽"
            >
              <ChevronRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          </nav>
        </div>
      </div>

      {sheet && <BlockSheet element={sheet} onClose={closeSheet} />}
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
 * 답을 계정에 저장할 수 없는 동안 띄우는 안내.
 *
 * 이 상태에서는 워크북 블록이 문항만 보여 주고 입력을 받지 않습니다
 * (`WorkbookResponsesProvider`). 잃는 답이 없으므로 경고가 아니라 초대입니다.
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
  // 비로그인 미리보기에는 이미 산 독자도 있습니다(새 기기). 구매 안내만
  // 띄우면 같은 책을 또 결제하게 되므로 로그인을 먼저 권합니다.
  const { title, description, href, label } = !isLoggedIn
    ? {
        title: "로그인하면 워크북에 답을 쓸 수 있어요",
        description: `쓴 답은 계정에 남아 다른 기기에서 이어 쓰고 PDF로 받을 수 있어요.${
          isPreview ? " 이미 구매했다면 로그인해 주세요." : ""
        }`,
        href: loginHref(bookId),
        label: "로그인",
      }
    : isPreview
      ? {
          title: "구매하면 워크북에 답을 쓸 수 있어요",
          description:
            "쓴 답은 계정에 남아 다른 기기에서 이어 쓰고 PDF로 받을 수 있어요.",
          href: bookHref(bookId),
          label: "책 정보 보기",
        }
      : {
          title: "이 책에서는 답을 쓸 수 없어요",
          description: "책 정보에서 이용 상태를 확인해 주세요.",
          href: bookHref(bookId),
          label: "책 정보 보기",
        };

  return (
    // 박스는 입력 블록 전용이라(DESIGN.md) 안내는 message처럼 색 글자와 아래 선만 둔다.
    <div className="mb-10 flex flex-col items-start gap-2 border-b border-line pb-6">
      <p className="text-body-sm font-semibold text-info">{title}</p>
      <p className="text-body-sm text-muted">{description}</p>
      <Button asChild variant="secondary" size="sm" className="mt-1">
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}

/**
 * 미리보기 챕터의 끝. 다음 챕터 대신 구매로 이어집니다. 비로그인이면
 * 이미 산 독자가 또 결제하지 않게 로그인도 함께 둡니다.
 */
function PreviewEnd({
  bookId,
  price,
  isLoggedIn,
}: {
  bookId: string;
  price: number;
  isLoggedIn: boolean;
}) {
  return (
    <div className="mt-16 flex flex-col items-start gap-2 border-t border-line pt-8">
      <p className="text-subtitle text-primary">미리보기는 여기까지예요</p>
      <p className="text-body-sm text-muted">
        구매하면 나머지 장을 읽고, 답을 쓰고 계정에 남길 수 있어요.
        {!isLoggedIn && " 이미 구매했다면 로그인해 주세요."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild>
          <Link href={bookHref(bookId)}>
            {price.toLocaleString("ko-KR")}원 · 책 정보 보기
          </Link>
        </Button>
        {!isLoggedIn && (
          <Button asChild variant="secondary">
            <Link href={loginHref(bookId)}>로그인</Link>
          </Button>
        )}
      </div>
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
