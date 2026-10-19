import { describe, expect, it } from "vitest";
import { interpretPublishResponse } from "./book-publish";

const blocker = {
  id: "unwritable-blocks",
  level: "blocker",
  title: "답을 받을 수 없는 블록",
  detail: "1장에 ID가 없는 블록이 있어요.",
};

describe("interpretPublishResponse", () => {
  it("2xx면 공개된 것입니다", () => {
    expect(interpretPublishResponse(200, { data: {} })).toEqual({ ok: true });
  });

  it("422 PUBLISH_BLOCKED면 차단 사유를 돌려줍니다", () => {
    const result = interpretPublishResponse(422, {
      error: "공개할 수 없어요: 답을 받을 수 없는 블록",
      code: "PUBLISH_BLOCKED",
      blockers: [blocker],
    });
    expect(result).toEqual({ ok: false, kind: "blocked", blockers: [blocker] });
  });

  it("차단인데 사유 목록이 없으면 고칠 곳을 보여 줄 수 없으므로 오류로 안내합니다", () => {
    const result = interpretPublishResponse(422, { code: "PUBLISH_BLOCKED" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("error");
  });

  it("사유 목록에서 모양이 깨진 항목은 버립니다", () => {
    const result = interpretPublishResponse(422, {
      code: "PUBLISH_BLOCKED",
      blockers: [blocker, { id: 1 }, null],
    });
    expect(result).toEqual({ ok: false, kind: "blocked", blockers: [blocker] });
  });

  it("그 밖의 실패는 서버 원문 대신 일반 문구입니다", () => {
    const result = interpretPublishResponse(500, {
      error: "duplicate key value violates unique constraint",
      code: "SERVER_ERROR",
    });
    expect(result).toEqual({
      ok: false,
      kind: "error",
      message: "공개하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    });
  });

  it("본문을 읽지 못해도 오류로 다룹니다", () => {
    expect(interpretPublishResponse(502, null)).toMatchObject({ ok: false, kind: "error" });
  });

  it("422라도 다른 코드면 차단이 아닙니다", () => {
    expect(interpretPublishResponse(422, { code: "VALIDATION_ERROR", blockers: [blocker] }))
      .toMatchObject({ ok: false, kind: "error" });
  });
});
