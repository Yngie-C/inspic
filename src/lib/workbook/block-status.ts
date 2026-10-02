/**
 * 블록 머리 줄에 쓰는 상태 문구 (DESIGN.md "워크북 블록").
 *
 * 상태는 색이 아니라 텍스트로 말합니다. 독자가 확인하고 싶은 것은 "방금
 * 쓴 게 남았나"이므로, 저장된 적 없는 것을 저장됐다고 쓰지 않는 것이
 * 가장 중요합니다.
 */

export interface BlockStatus {
  text: string;
  /** ok는 accent(저장됨·완료), danger는 저장 실패. */
  tone: "muted" | "ok" | "danger";
}

export interface SaveStatusInput {
  /** 이 블록에 답이 하나라도 있다. */
  hasAnswer: boolean;
  /** 아직 서버로 못 보낸 응답이 있다. */
  pending: boolean;
  /** 이번 세션에서 마지막으로 저장에 성공한 시각(ms). */
  savedAt: number | null;
  /**
   * 이 블록의 저장이 실패했다(연결 오류든 서버 거절이든).
   *
   * 책 전체 상태로 판정하지 마세요. 그러면 실패한 적 없는 블록도 입력할
   * 때마다 디바운스 동안 "저장 안 됨"이 뜹니다(코드 리뷰 3-P1-5).
   */
  failed: boolean;
  now: number;
}

const MINUTE = 60_000;

export function describeSave({
  hasAnswer,
  pending,
  savedAt,
  failed,
  now,
}: SaveStatusInput): BlockStatus {
  if (failed) return { text: "저장 안 됨", tone: "danger" };
  if (pending) return { text: "저장 중", tone: "muted" };
  if (savedAt !== null) {
    return { text: `저장됨 · ${elapsed(now - savedAt)}`, tone: "ok" };
  }
  if (!hasAnswer) return { text: "작성 전", tone: "muted" };
  // 불러온 답은 서버에서 왔을 수도, 이 기기 캐시에만 있을 수도 있습니다.
  // 둘을 구분할 수 없으므로 "저장됨"이라 하지 않습니다. 이 세션에서
  // 저장에 성공한 것만 저장됐다고 씁니다.
  return { text: "작성함", tone: "muted" };
}

function elapsed(ms: number): string {
  if (ms < MINUTE) return "방금";
  const minutes = Math.floor(ms / MINUTE);
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

/** 체크리스트: "3개 중 2개". 모두 채우면 accent. */
export function describeChecklist(total: number, done: number): BlockStatus {
  return {
    text: `${total}개 중 ${done}개`,
    tone: total > 0 && done === total ? "ok" : "muted",
  };
}

/**
 * 척도: 고른 값을 그대로 말합니다.
 *
 * 저자가 범위를 줄여 저장된 답이 칸 밖에 남으면(`outOfRange`) 그 사실을
 * 말합니다. "작성 전"이라 하면 진행률·참여율은 그 답을 "답함"으로 세는데
 * 블록만 미응답으로 보여 판정이 갈립니다.
 */
export function describeScale(
  selected: number | null,
  outOfRange: number | null = null,
): BlockStatus {
  if (selected === null && outOfRange !== null) {
    return { text: `예전 답 ${outOfRange} · 다시 골라 주세요`, tone: "muted" };
  }
  return selected === null
    ? { text: "작성 전", tone: "muted" }
    : { text: `${selected} 선택됨`, tone: "muted" };
}

/**
 * 진행을 말하는 블록(체크리스트·척도)의 상태에 저장 결과를 얹습니다.
 * 진행 문구만 보이면 실패한 선택이 저장된 것처럼, 저장된 선택이 아직
 * 안 된 것처럼 읽히기 때문입니다. "저장됨"은 `describeSave`와 같이
 * 이번 세션에서 저장에 성공한 경우에만 붙입니다.
 */
export function withSaveState(
  progress: BlockStatus,
  {
    pending,
    failed,
    savedAt,
  }: { pending: boolean; failed: boolean; savedAt: number | null },
): BlockStatus {
  if (failed) return { text: "저장 안 됨", tone: "danger" };
  if (!pending && savedAt !== null) {
    return { ...progress, text: `${progress.text} · 저장됨` };
  }
  return progress;
}
