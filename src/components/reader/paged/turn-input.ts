/**
 * 쪽 넘김 조작(화살표 키·좌우 탭·스와이프)을 받을지 판정합니다.
 *
 * s-growthlab의 `SwipeHandler`는 `window`에서 ←/→를 받아 `preventDefault`하고,
 * 탭 영역이 입력 요소를 가리지 않았습니다. 그 저장소는 본문이 읽기 전용이라
 * 괜찮았지만, 여기서는 글을 쓰다 ←를 누르거나 카드 버튼을 누르면 쪽이
 * 넘어갑니다.
 */

export type TurnDirection = "forward" | "back";

/** 이 위에서 시작한 탭·스와이프는 쪽을 넘기지 않습니다. */
export const NO_TURN_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a",
  "label",
  "[contenteditable]",
  "[role=button]",
  "[role=dialog]",
  "[data-workbook-card]",
  "[class*='template-']",
].join(", ");

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** 넘김을 받지 않을 곳에서 시작했는가. */
export function startsOnControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(NO_TURN_SELECTOR) !== null;
}

type KeyInput = Pick<
  KeyboardEvent,
  "key" | "isComposing" | "altKey" | "metaKey" | "ctrlKey" | "target"
>;

/**
 * 화살표·PageUp/PageDown. 입력 중이거나 한글 조합 중이거나, 시트·목차가
 * 떠 있으면(`blocked`) 넘기지 않습니다.
 */
export function keyTurn(event: KeyInput, blocked: boolean): TurnDirection | null {
  if (blocked || event.isComposing || event.altKey || event.metaKey || event.ctrlKey) {
    return null;
  }
  if (isEditableTarget(event.target)) return null;
  if (event.key === "ArrowRight" || event.key === "PageDown") return "forward";
  if (event.key === "ArrowLeft" || event.key === "PageUp") return "back";
  return null;
}

/** 본문 폭에서 누른 위치의 비율(0~1). 좌우 20%만 넘깁니다. */
export function tapTurn(ratio: number): TurnDirection | null {
  if (ratio < 0.2) return "back";
  if (ratio > 0.8) return "forward";
  return null;
}

export interface TouchPoint {
  x: number;
  y: number;
  /** ms */
  t: number;
}

const SWIPE_MIN_DISTANCE = 60;
const SWIPE_MAX_DURATION = 500;

/** 짧고 분명한 가로 스와이프만 넘깁니다. 세로가 우세하면 무시합니다. */
export function swipeTurn(start: TouchPoint, end: TouchPoint): TurnDirection | null {
  if (end.t - start.t > SWIPE_MAX_DURATION) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) {
    return null;
  }
  return dx < 0 ? "forward" : "back";
}
