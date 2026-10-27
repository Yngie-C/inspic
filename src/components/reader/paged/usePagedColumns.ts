"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * CSS multi-column으로 본문을 쪽으로 나눕니다. s-growthlab의
 * `useVirtualPaginator`(multi-column + `translateX`)를 바탕으로 고친 것:
 *
 * - 다시 나눌 때 쪽 번호가 아니라 **기준 요소**를 지킵니다. 화면 폭이나
 *   키보드 때문에 쪽 수가 바뀌어도 보던 문단이 있는 쪽으로 갑니다.
 * - 본문 길이가 바뀌는 것을 봅니다. 고정 높이 컨테이너만 보면 이미지가
 *   늦게 떴을 때 쪽 수가 그대로입니다. 요소마다 크기를 보고, 이미지
 *   `load`를 받습니다.
 * - 포커스가 다른 쪽의 버튼·링크로 가면 브라우저가 `overflow: hidden`
 *   래퍼를 몰래 가로 스크롤합니다. 그 스크롤을 되돌리고 그 쪽으로 갑니다.
 *
 * `MutationObserver`는 `childList`만 봅니다. `attributes`까지 보면 자동
 * 높이 조절의 style 변경까지 잡아 키 입력마다 다시 나눕니다(M0에서 지운 옛
 * 페이지네이터가 그랬습니다).
 *
 * 쪽 넘김은 움직임 없이 바로 바뀝니다 — DESIGN.md는 위치를 애니메이션하지
 * 않습니다.
 */

/** 기준 요소 후보: 흐름의 맨 위 요소와 본문의 맨 위 요소. */
const ANCHOR_SELECTOR =
  ":scope > :not(.reader-content), :scope > .reader-content > *";

/** 쪽을 넘긴 뒤 포커스를 옮길 곳. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/**
 * 문서 순서로 늘어선 요소 중 `target` 쪽에서 **시작하는** 첫 요소. 그 쪽에서
 * 시작하는 요소가 없으면(앞 쪽에서 시작한 긴 문단·목록이 쪽 전체를 차지) null
 * 입니다. 뒤 쪽 요소를 기준으로 삼으면 다시 잴 때 그 쪽으로 건너뜁니다.
 */
export function firstStartingOn<T>(
  nodes: Iterable<T>,
  pageOf: (node: T) => number,
  target: number,
): T | null {
  for (const node of nodes) {
    const page = pageOf(node);
    if (page === target) return node;
    if (page > target) return null;
  }
  return null;
}

interface Options {
  /** 바뀌면 처음부터 다시 나눕니다(장 이동). */
  contentKey: string;
  /** 쪽 사이 간격(px). */
  gap?: number;
}

export function usePagedColumns({ contentKey, gap = 48 }: Options) {
  const clipRef = useRef<HTMLDivElement | null>(null);
  const columnsRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(1);

  const pageRef = useRef(0);
  const totalRef = useRef(1);
  const anchorRef = useRef<Element | null>(null);
  /** 다음 측정에서 갈 곳. 앞 장의 마지막 쪽으로 돌아갈 때 씁니다. */
  const pendingRef = useRef<"first" | "last" | null>("first");
  const rafRef = useRef<number | null>(null);

  // 쪽 폭은 소수까지 씁니다. 정수로 반올림된 `clientWidth`로 이동 거리를 정하면
  // 확대·소수 폭에서 쪽마다 오차가 쌓여 뒤쪽 쪽의 본문이 잘리고 앞 단이 비칩니다.
  const width = useCallback(() => {
    const clip = clipRef.current;
    return clip ? clip.getBoundingClientRect().width : 0;
  }, []);

  const step = useCallback(() => {
    const clipWidth = width();
    return clipWidth > 0 ? clipWidth + gap : 0;
  }, [gap, width]);

  const pageOf = useCallback(
    (node: Element) => {
      const columns = columnsRef.current;
      const width = step();
      if (!columns || width === 0) return 0;
      // 둘 다 같은 transform 안에 있으므로 차이는 레이아웃상의 위치입니다.
      // 단 사이 간격의 절반만큼 여유를 두고 내림합니다. 여유가 1px이면 소수점
      // 픽셀이 쌓여 뒤쪽 쪽의 맨 위 요소를 한 쪽 앞으로 셉니다. 반올림하면
      // 단 오른편의 버튼을 다음 쪽으로 셉니다. 간격 안에는 아무것도 없습니다.
      const left =
        node.getBoundingClientRect().left - columns.getBoundingClientRect().left;
      return Math.max(0, Math.floor((left + gap / 2) / width));
    },
    [gap, step],
  );

  /** 그 쪽에서 시작하는 첫 요소. 쪽 전체가 한 문단 안이면 null. */
  const anchorOn = useCallback(
    (target: number) => {
      const columns = columnsRef.current;
      if (!columns) return null;
      return firstStartingOn(columns.querySelectorAll(ANCHOR_SELECTOR), pageOf, target);
    },
    [pageOf],
  );

  const apply = useCallback(
    (target: number) => {
      const columns = columnsRef.current;
      const clip = clipRef.current;
      if (!columns || !clip) return;
      columns.style.transform = `translateX(-${step() * target}px)`;
      clip.scrollLeft = 0;
      pageRef.current = target;
      setPage(target);
    },
    [step],
  );

  const measure = useCallback(() => {
    const columns = columnsRef.current;
    const clip = clipRef.current;
    const clipWidth = width();
    if (!columns || !clip || clipWidth === 0) return;

    columns.style.columnWidth = `${clipWidth}px`;
    columns.style.columnGap = `${gap}px`;
    columns.style.setProperty("--page-height", `${clip.clientHeight}px`);
    // 강제 reflow. 없으면 scrollWidth가 이전 값이라 쪽 수가 1로 굳습니다.
    void columns.offsetHeight;

    const pages = Math.max(1, Math.round((columns.scrollWidth + gap) / step()));
    totalRef.current = pages;
    setTotal(pages);

    const pending = pendingRef.current;
    pendingRef.current = null;
    let target: number;
    if (pending === "first") target = 0;
    else if (pending === "last") target = pages - 1;
    else if (anchorRef.current?.isConnected) target = pageOf(anchorRef.current);
    else target = pageRef.current;

    apply(Math.min(Math.max(target, 0), pages - 1));
    if (pending || !anchorRef.current?.isConnected) {
      anchorRef.current = anchorOn(pageRef.current);
    }
  }, [anchorOn, apply, gap, pageOf, step, width]);

  const schedule = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      measure();
    });
  }, [measure]);

  const goTo = useCallback(
    (target: number) => {
      const clamped = Math.min(Math.max(target, 0), totalRef.current - 1);
      apply(clamped);
      anchorRef.current = anchorOn(clamped);
    },
    [anchorOn, apply],
  );

  /**
   * 키·버튼으로 쪽을 넘길 때. 포커스가 이전 쪽 버튼에 남아 있으면 다음 Tab이
   * `focusin`으로 그 쪽에 되돌아가고, Enter는 보이지 않는 카드를 엽니다. 새 쪽의
   * 첫 버튼·링크로 옮기고, 없으면 포커스를 놓습니다.
   */
  const turnTo = useCallback(
    (target: number) => {
      goTo(target);
      const columns = columnsRef.current;
      const active = document.activeElement;
      if (!columns || !(active instanceof HTMLElement) || !columns.contains(active)) {
        return;
      }
      if (pageOf(active) === pageRef.current) return;
      const control = [...columns.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].find(
        (node) => pageOf(node) === pageRef.current,
      );
      if (control) control.focus({ preventScroll: true });
      else active.blur();
    },
    [goTo, pageOf],
  );

  /** 다음 쪽으로. 마지막 쪽이면 false. 새 장을 재는 중이면 넘기지 않고 true. */
  const next = useCallback(() => {
    // 장을 바꾼 뒤 재기 전에 또 넘기면 새 장을 한 쪽짜리로 보고 다음 장으로
    // 갑니다. 재기 전 넘김은 삼킵니다.
    if (pendingRef.current !== null) return true;
    if (pageRef.current >= totalRef.current - 1) return false;
    turnTo(pageRef.current + 1);
    return true;
  }, [turnTo]);

  /** 이전 쪽으로. 첫 쪽이면 false. 새 장을 재는 중이면 넘기지 않고 true. */
  const prev = useCallback(() => {
    if (pendingRef.current !== null) return true;
    if (pageRef.current <= 0) return false;
    turnTo(pageRef.current - 1);
    return true;
  }, [turnTo]);

  /** 지금 장의 첫 쪽으로. 목차에서 지금 장을 다시 골랐을 때. */
  const first = useCallback(() => {
    if (pendingRef.current !== null) return;
    turnTo(0);
  }, [turnTo]);

  /**
   * 다른 장으로 바꾸기 직전에 부릅니다. 새 본문을 그린 뒤 어디서 시작할지.
   * 장이 그대로면 `contentKey`가 바뀌지 않아 재지 않으니 `first()`를 쓰세요.
   */
  const startAt = useCallback((where: "first" | "last") => {
    pendingRef.current = where;
    anchorRef.current = null;
  }, []);

  // 장이 바뀌면 다시 나눕니다. `startAt` 없이 바뀌었으면(보던 장이 목록에서
  // 사라짐) 첫 쪽에서 시작합니다. 옛 기준 요소는 DOM이 재사용돼 아직 붙어
  // 있을 수 있으니 보지 않습니다.
  useEffect(() => {
    if (pendingRef.current === null) pendingRef.current = "first";
    anchorRef.current = null;
    schedule();
  }, [contentKey, schedule]);

  useEffect(() => {
    const columns = columnsRef.current;
    const clip = clipRef.current;
    if (!columns || !clip) return;

    // 화면 크기·키보드: 쪽 크기가 바뀝니다.
    const outer = new ResizeObserver(schedule);
    outer.observe(clip);

    // 본문 길이: 요소마다 봅니다.
    const inner = new ResizeObserver(schedule);
    const watch = () => {
      inner.disconnect();
      columns.querySelectorAll(ANCHOR_SELECTOR).forEach((node) => inner.observe(node));
    };
    watch();
    const mutations = new MutationObserver(() => {
      watch();
      schedule();
    });
    mutations.observe(columns, { childList: true, subtree: true });

    // 이미지는 load가 버블링되지 않으므로 캡처로 받습니다.
    columns.addEventListener("load", schedule, true);

    // 키보드로 다른 쪽의 버튼·링크에 가면 그 쪽으로 넘깁니다.
    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = pageOf(event.target);
      if (target !== pageRef.current) goTo(target);
    };
    columns.addEventListener("focusin", onFocusIn);

    // 브라우저가 포커스한 요소를 보이려고 래퍼를 가로 스크롤한 경우.
    const onClipScroll = () => {
      if (clip.scrollLeft === 0) return;
      clip.scrollLeft = 0;
      const active = document.activeElement;
      if (active && columns.contains(active)) goTo(pageOf(active));
    };
    clip.addEventListener("scroll", onClipScroll);

    return () => {
      outer.disconnect();
      inner.disconnect();
      mutations.disconnect();
      columns.removeEventListener("load", schedule, true);
      columns.removeEventListener("focusin", onFocusIn);
      clip.removeEventListener("scroll", onClipScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [goTo, pageOf, schedule]);

  return { clipRef, columnsRef, page, total, next, prev, first, startAt };
}
