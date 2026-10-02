"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * 글이 늘면 textarea도 늘어나게 합니다.
 *
 * 값이 바뀔 때만 재면 창을 좁히거나 폰을 돌렸을 때 줄바꿈이 늘어난 만큼
 * 아랫부분이 잘려 보였습니다(코드 리뷰 3-P1-14). 너비가 바뀔 때도 다시 잽니다.
 */
export function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    fitHeight(ref.current);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      // 높이는 여기서 바꾸므로, 너비가 그대로면 다시 재지 않습니다.
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fitHeight(el);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

function fitHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  // scrollHeight에는 테두리가 들어가지 않습니다. 빼먹으면 마지막 줄이 2px
  // 잘려 스크롤이 생깁니다.
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
}
