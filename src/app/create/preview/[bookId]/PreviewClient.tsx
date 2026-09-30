"use client";

import { PreviewToolbar } from "@/components/preview/PreviewToolbar";
import { PreviewFrame } from "@/components/preview/PreviewFrame";
import { PublishChecklist } from "@/components/preview/PublishChecklist";
import { useState, useEffect } from "react";
import { Monitor, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Viewport = "desktop" | "tablet" | "mobile";

const MIN_WIDTH = 1024;

interface Props {
  bookId: string;
  bookTitle: string;
  isPublished: boolean;
}

export function PreviewClient({ bookId, bookTitle, isPublished }: Props) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [isTooNarrow, setIsTooNarrow] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const check = () => setIsTooNarrow(window.innerWidth < MIN_WIDTH);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isTooNarrow) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-mark px-6 text-center">
        <div className="rounded-lg border border-line bg-surface p-8 max-w-sm w-full">
          <Monitor className="mx-auto h-12 w-12 text-faint" />
          <h2 className="mt-4 text-lg font-semibold text-primary">
            데스크톱에서 이용해주세요
          </h2>
          <p className="mt-2 text-sm text-muted">
            미리보기 기능은 넓은 화면에서만 사용할 수 있습니다.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild>
              <Link href={`/create/edit/${bookId}`}>편집으로 돌아가기</Link>
            </Button>
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center justify-center gap-1.5 text-sm text-muted hover:text-muted transition-colors"
            >
              <HelpCircle className="h-4 w-4" />
              왜 비활성화 되나요?
            </button>
          </div>
        </div>

        {/* Help modal */}
        {showHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 px-4">
            <div className="relative max-w-md w-full rounded-lg bg-surface p-6 shadow-float">
              <button
                onClick={() => setShowHelp(false)}
                className="absolute right-4 top-4 rounded-lg p-1 text-muted hover:bg-mark hover:text-muted"
              >
                <X className="h-5 w-5" />
              </button>
              <h3 className="text-lg font-semibold text-primary">
                미리보기 기능 안내
              </h3>
              <div className="mt-4 space-y-3 text-sm text-muted">
                <p>
                  미리보기는 고객이 보는 화면을 다양한 기기 크기(데스크톱, 태블릿, 모바일)로
                  시뮬레이션하는 기능입니다.
                </p>
                <p>
                  정확한 시뮬레이션을 위해 화면 안에 가상 기기 프레임을 표시하는데,
                  이를 위해 <strong>최소 1024px 이상</strong>의 브라우저 너비가 필요합니다.
                </p>
                <p>
                  데스크톱 브라우저에서 전체 화면으로 접속하면 미리보기를 사용할 수 있습니다.
                </p>
              </div>
              <Button
                className="mt-6 w-full"
                onClick={() => setShowHelp(false)}
              >
                확인
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-mark">
      <PreviewToolbar
        bookId={bookId}
        bookTitle={bookTitle}
        viewport={viewport}
        onViewportChange={setViewport}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-y-auto">
          <PreviewFrame bookId={bookId} viewport={viewport} />
        </div>
        <PublishChecklist bookId={bookId} isPublished={isPublished} />
      </div>
    </div>
  );
}
