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
            넓은 화면에서 열어 주세요
          </h2>
          <p className="mt-2 text-sm text-muted">
            검수와 공개는 너비 1024px 이상의 화면에서 할 수 있어요.
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
              왜 넓은 화면이 필요한가요?
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
                넓은 화면이 필요한 이유
              </h3>
              <div className="mt-4 space-y-3 text-sm text-muted">
                <p>
                  미리보기는 독자에게 보일 화면을 데스크톱·태블릿·모바일 크기로 바꿔 가며
                  보여 주고, 옆에 공개 전 검수 결과를 함께 띄워요.
                </p>
                <p>
                  기기 틀과 검수 패널을 나란히 놓으려면 브라우저 너비가
                  <strong>1024px 이상</strong>이어야 해요.
                </p>
                <p>
                  컴퓨터에서 브라우저 창을 넓혀 다시 열어 주세요.
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
