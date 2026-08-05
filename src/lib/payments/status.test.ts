import { describe, expect, it } from "vitest";
import { paymentPhase, transactionStatus } from "./status";

/**
 * 승인과 취소를 가르는 판정. 라우트 안에 문자열 비교로 흩어지면
 * confirm과 webhook이 서로 다르게 판단하기 시작합니다.
 */

describe("paymentPhase", () => {
  it("DONE만 승인으로 본다", () => {
    expect(paymentPhase("DONE")).toBe("settled");
  });

  it.each(["CANCELED", "PARTIAL_CANCELED", "ABORTED", "EXPIRED"])(
    "%s는 되돌려야 하는 상태다",
    (status) => {
      expect(paymentPhase(status)).toBe("voided");
    },
  );

  it.each(["READY", "IN_PROGRESS", "WAITING_FOR_DEPOSIT"])(
    "%s는 아직 결론이 아니다",
    (status) => {
      expect(paymentPhase(status)).toBe("pending");
    },
  );

  it("모르는 상태는 승인으로도 취소로도 넘겨짚지 않는다", () => {
    // Toss가 상태를 새로 만들었을 때 넘겨짚는 것보다, 아무것도 하지
    // 않고 다음 webhook을 기다리는 쪽이 안전합니다.
    expect(paymentPhase("SOMETHING_NEW")).toBe("pending");
    expect(paymentPhase("")).toBe("pending");
  });
});

describe("transactionStatus", () => {
  it("결제 행에 저장할 값으로 옮긴다", () => {
    expect(transactionStatus("DONE")).toBe("done");
    expect(transactionStatus("CANCELED")).toBe("canceled");
    expect(transactionStatus("PARTIAL_CANCELED")).toBe("partial_canceled");
    expect(transactionStatus("EXPIRED")).toBe("expired");
    expect(transactionStatus("ABORTED")).toBe("aborted");
  });

  it("가상계좌 입금 대기는 진행 중으로 둔다", () => {
    expect(transactionStatus("WAITING_FOR_DEPOSIT")).toBe("in_progress");
  });

  it("모르는 상태는 ready로 떨어뜨린다 — 스키마의 CHECK를 깨지 않는다", () => {
    expect(transactionStatus("SOMETHING_NEW")).toBe("ready");
  });
});
