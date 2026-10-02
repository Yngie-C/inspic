/**
 * 블록의 표현 설정(`data-*`)을 해석하는 규칙.
 *
 * 에디터 node view, 리더 컴포넌트, 블록 추출기, EPUB/PDF 폴백, 응답 저장
 * 라우트가 같은 속성을 읽습니다. 각자 해석하면 같은 블록이 화면마다 다르게
 * 보이고(에디터는 1..10, 리더는 0..10), 서버가 받아 주는 값과 리더가 그리는
 * 버튼이 어긋납니다. 해석은 여기 한 곳에서만 하세요.
 */

/** 척도의 기본 범위. 저작 화면이 새 블록에 넣는 값과 같습니다. */
export const DEFAULT_SCALE_RANGE = { min: 1, max: 10 } as const;

/**
 * 척도 칸 수의 상한. `data-max="100000"`이면 화면이 10만 개 버튼을 그리다
 * 멈춥니다. 0..20까지 담을 수 있게 둡니다.
 */
export const MAX_SCALE_STEPS = 21;

/** 끝값의 절댓값 상한. 이보다 크면 손으로 고친 HTML로 보고 기본값을 씁니다. */
const MAX_SCALE_BOUND = 1000;

export interface ScaleRange {
  min: number;
  max: number;
}

/**
 * `data-min` / `data-max`(또는 DB의 `config.min` / `config.max`)를 범위로
 * 바꿉니다.
 *
 * - 비었거나 숫자가 아니면 그쪽 끝만 기본값을 씁니다. `0`은 유효한 값입니다
 *   (예전 에디터는 `parseInt(min) || 1`이라 0을 1로 바꿨습니다).
 * - 뒤집혔거나 끝값이 터무니없으면 기본 범위로 돌아갑니다.
 * - 칸이 너무 많으면 `min`부터 {@link MAX_SCALE_STEPS}칸으로 자릅니다.
 */
export function scaleRange(rawMin: unknown, rawMax: unknown): ScaleRange {
  const min = toInt(rawMin) ?? DEFAULT_SCALE_RANGE.min;
  const max = toInt(rawMax) ?? DEFAULT_SCALE_RANGE.max;

  if (
    Math.abs(min) > MAX_SCALE_BOUND ||
    Math.abs(max) > MAX_SCALE_BOUND ||
    max < min
  ) {
    return { ...DEFAULT_SCALE_RANGE };
  }

  return { min, max: Math.min(max, min + MAX_SCALE_STEPS - 1) };
}

/** 범위의 칸들. */
export function scaleSteps({ min, max }: ScaleRange): number[] {
  const steps: number[] = [];
  for (let value = min; value <= max; value++) steps.push(value);
  return steps;
}

/** 저장된 값이 지금 범위 안의 칸인가. 저자가 범위를 줄이면 밖으로 나갑니다. */
export function isInScale(value: number, { min, max }: ScaleRange): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function toInt(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isInteger(raw) ? raw : null;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  // parseInt는 "1e9"를 1로, "5px"를 5로 읽습니다. 정수 표기만 받습니다.
  const parsed = Number(raw.trim());
  return Number.isInteger(parsed) ? parsed : null;
}

/** 콜아웃 종류. 라벨·표시는 화면마다 다르지만 종류 목록은 하나입니다. */
export const CALLOUT_TYPES = ["note", "tip", "warning", "info"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

/** 비었거나 모르는 종류일 때. 리더·폴백·추출기가 예전부터 쓰던 값입니다. */
export const DEFAULT_CALLOUT_TYPE: CalloutType = "note";

/**
 * `data-callout-type`을 종류로 바꿉니다.
 *
 * `raw in TABLE`로 판정하면 `constructor`·`toString` 같은 프로토타입 키가
 * 통과합니다. 목록에 있는 값만 받습니다.
 */
export function calloutTypeOf(raw: unknown): CalloutType {
  return (CALLOUT_TYPES as readonly unknown[]).includes(raw)
    ? (raw as CalloutType)
    : DEFAULT_CALLOUT_TYPE;
}
