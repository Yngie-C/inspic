import {
  AuthApiError,
  AuthError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthWeakPasswordError,
} from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authFailureFromQuery,
  checkPassword,
  linkErrorCase,
  linkErrorFromParams,
  toAuthFailure,
} from "./auth-errors";

const api = (code: string, status = 400) => new AuthApiError("raw english", status, code);

describe("toAuthFailure", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["invalid_credentials", "invalid_credentials", undefined, "reset"],
    ["email_not_confirmed", "email_not_confirmed", undefined, "resend"],
    ["user_already_exists", "user_already_exists", "email", "login"],
    ["email_exists", "user_already_exists", "email", "login"],
    ["same_password", "same_password", "password", undefined],
    ["email_address_invalid", "email_invalid", "email", undefined],
    ["validation_failed", "email_invalid", "email", undefined],
    ["over_request_rate_limit", "rate_limited", undefined, undefined],
    ["over_email_send_rate_limit", "email_rate_limited", undefined, undefined],
    ["signup_disabled", "signup_disabled", undefined, undefined],
  ])("%s → %s", (code, kind, field, action) => {
    const failure = toAuthFailure(api(code), "signin");
    expect(failure.case).toBe(kind);
    expect(failure.field).toBe(field);
    expect(failure.action).toBe(action);
    expect(failure.message).not.toContain("raw english");
  });

  it("네트워크 실패는 network", () => {
    expect(toAuthFailure(new AuthRetryableFetchError("Failed to fetch", 0), "signin").case).toBe("network");
    expect(toAuthFailure(new TypeError("Failed to fetch"), "signup").case).toBe("network");
  });

  it("약한 비밀번호는 이유별로 문구가 다르다", () => {
    const msg = (reasons: ("length" | "characters" | "pwned")[]) =>
      toAuthFailure(new AuthWeakPasswordError("weak", 422, reasons), "signup");
    expect(msg(["length"]).message).toContain("6자");
    expect(msg(["characters"]).message).toContain("섞어");
    expect(msg(["length", "pwned"]).message).toContain("유출");
    expect(msg(["length"]).field).toBe("password");
  });

  it("길이와 문자 조합이 함께 틀리면 한 번에 안내한다", () => {
    const failure = toAuthFailure(
      new AuthWeakPasswordError("weak", 422, ["length", "characters"]),
      "signup",
    );
    expect(failure.message).toContain("섞어");
    expect(failure.message).toContain("6자");
  });

  it("재설정 화면의 validation_failed는 이메일이 아니라 비밀번호 문제다", () => {
    const failure = toAuthFailure(api("validation_failed"), "update");
    expect(failure.case).toBe("password_too_long");
    expect(failure.field).toBe("password");
  });

  it("세션이 없으면 재설정 화면에서는 재설정을 다시 요청하게 한다", () => {
    const failure = toAuthFailure(new AuthSessionMissingError(), "update");
    expect(failure.case).toBe("session_missing");
    expect(failure.action).toBe("reset");
  });

  it("code 없는 429는 rate_limited", () => {
    expect(toAuthFailure(new AuthError("Too many", 429), "signin").case).toBe("rate_limited");
  });

  it("모르는 에러는 원문을 화면에 내지 않는다", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const error of [api("hook_timeout", 500), api("constructor"), new Error("boom"), "x"]) {
      const failure = toAuthFailure(error, "signin");
      expect(failure.case).toBe("unknown");
      expect(failure.message).not.toMatch(/raw english|boom/);
    }
  });
});

describe("인증 링크 실패", () => {
  it("코드를 만료 / 다른 브라우저 / 잘못된 링크로 나눈다", () => {
    expect(linkErrorCase("otp_expired")).toBe("link_expired");
    expect(linkErrorCase("flow_state_expired")).toBe("link_expired");
    expect(linkErrorCase("bad_code_verifier")).toBe("link_other_browser");
    expect(linkErrorCase("pkce_code_verifier_not_found")).toBe("link_other_browser");
    expect(linkErrorCase("something_else")).toBe("link_invalid");
    expect(linkErrorCase(undefined)).toBe("link_invalid");
  });

  it("콜백 쿼리에 실패 표시가 없으면 null", () => {
    expect(linkErrorFromParams(new URLSearchParams("code=abc"))).toBeNull();
    expect(
      linkErrorFromParams(new URLSearchParams("error=access_denied&error_code=otp_expired")),
    ).toBe("link_expired");
    expect(linkErrorFromParams(new URLSearchParams("error=access_denied"))).toBe("link_invalid");
  });
});

describe("authFailureFromQuery", () => {
  it("정해 둔 값만 안내로 바꾼다", () => {
    expect(authFailureFromQuery("link_expired")?.action).toBe("resend");
    expect(authFailureFromQuery("reset_link_expired")?.action).toBe("reset");
    expect(authFailureFromQuery("auth_failed")?.case).toBe("link_invalid");
  });

  it("그 밖의 값은 띄우지 않는다", () => {
    for (const value of [null, "", "<script>", "constructor", "__proto__", "toString"]) {
      expect(authFailureFromQuery(value)).toBeNull();
    }
  });
});

describe("checkPassword", () => {
  it("규칙을 지키면 null", () => {
    expect(checkPassword("abc123")).toBeNull();
    expect(checkPassword("Passw0rd!")).toBeNull();
  });

  it("짧으면 길이를, 영문·숫자가 빠지면 조합을 안내한다", () => {
    expect(checkPassword("ab12")).toContain("짧아요");
    expect(checkPassword("abcdefgh")).toContain("섞어");
    expect(checkPassword("12345678")).toContain("섞어");
    // 한글은 영문으로 세지 않습니다 (Supabase의 letters는 a-z, A-Z).
    expect(checkPassword("비밀번호1234")).toContain("섞어");
  });

  it("둘 다 틀리면 한 문장으로 함께 안내한다", () => {
    const message = checkPassword("12345");
    expect(message).toContain("섞어");
    expect(message).toContain("6자 이상");
  });

  it("72바이트를 넘으면 막는다 — 한글은 글자당 3바이트다", () => {
    expect(checkPassword("a1".repeat(36))).toBeNull();
    expect(checkPassword("a1".repeat(36) + "x")).toContain("너무 길어요");
    expect(checkPassword("a1" + "가".repeat(24))).toContain("너무 길어요");
  });
});
