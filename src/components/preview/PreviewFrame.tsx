"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTHS: Record<Viewport, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

interface Props {
  bookId: string;
  viewport: Viewport;
}

export function PreviewFrame({ bookId, viewport }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [scale, setScale] = useState(1);

  const iframeWidth = VIEWPORT_WIDTHS[viewport];
  const iframeSrc = `/reader/${bookId}`;

  // Allowed URL patterns for navigation guard
  const allowedPatterns = [`/book/${bookId}`, `/reader/${bookId}`];

  // Calculate scale to fit container
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth - 48;
      const newScale = Math.min(1, containerWidth / iframeWidth);
      setScale(newScale);
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [iframeWidth]);

  // Reset loading/error on src change
  useEffect(() => {
    setLoading(true);
    setError(false);
  }, [iframeSrc]);

  // Navigation guard: poll contentWindow.location for soft navigation
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const interval = setInterval(() => {
      try {
        const pathname = iframe.contentWindow?.location?.pathname;
        if (!pathname) return;

        const isAllowed = allowedPatterns.some((pattern) =>
          pathname.startsWith(pattern)
        );

        if (!isAllowed) {
          iframe.src = iframeSrc;
        }
      } catch {
        // Cross-origin or iframe not ready
      }
    }, 500);

    return () => clearInterval(interval);
  }, [iframeSrc, allowedPatterns]);

  const handleLoad = useCallback(() => {
    setLoading(false);
    setError(false);
  }, []);

  // Timeout for error detection
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) setError(true);
    }, 8000);

    return () => clearTimeout(timer);
  }, [loading, iframeSrc]);

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    if (iframeRef.current) {
      iframeRef.current.src = iframeSrc;
    }
  };

  return (
    <div ref={containerRef} className="flex flex-1 flex-col items-center px-6 py-6">
      {/* Preview mode banner */}
      <div className="mb-4 flex items-center gap-2 py-2 text-sm text-info">
        <span className="inline-block h-2 w-2 rounded-full bg-info" />
        미리보기 모드 — 독자에게 이렇게 보여요
      </div>

      {/* Frame container */}
      <div className="relative w-full flex justify-center">
        <div
          style={{
            width: iframeWidth,
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            height: `${(100 / scale) * 0.85}vh`,
          }}
          className="relative rounded-lg border border-line-strong bg-surface shadow-float overflow-hidden"
        >
          {/* Loading skeleton */}
          {loading && !error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-surface">
              <div className="space-y-4 w-3/4">
                <div className="h-8 w-2/3 animate-pulse rounded bg-line" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-line" />
                <div className="h-40 w-full animate-pulse rounded bg-line" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-line" />
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-surface">
              <AlertCircle className="h-10 w-10 text-muted" />
              <p className="text-sm text-muted">미리보기를 불러오지 못했어요.</p>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                다시 시도
              </Button>
            </div>
          )}

          {/* iframe */}
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            onLoad={handleLoad}
            className="h-full w-full border-0"
            title="미리보기"
          />
        </div>
      </div>
    </div>
  );
}
