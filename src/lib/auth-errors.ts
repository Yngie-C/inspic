import {
  isAuthError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  isAuthWeakPasswordError,
} from "@supabase/supabase-js";

/**
 * 인증 실패를 화면에 보일 문구로 바꾸는 유일한 곳입니다.
 *
 * Supabase의 `error.message`는 영문 시스템 메시지라 화면에 그대로 내지
 * 않습니다. 판정은 `error.code`(없으면 에러 클래스와 HTTP 상태)로 하고,
 * 모르는 에러는 원문을 콘솔에만 남긴 채 일반 문구로 안내합니다.
 */

export type AuthErrorCase =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "user_already_exists"
  | "weak_password"
  | "password_too_long"
  | "same_password"
  | "email_invalid"
  | "rate_limited"
  | "email_rate_limited"
  | "signup_disabled"
  | "network"
  | "session_missing"
  | "link_expired"
  | "link_other_browser"
  | "link_invalid"
  | "unknown";

export type AuthErrorContext = "signin" | "signup" | "resend" | "reset" | "update";

export interface AuthFailure {
  case: AuthErrorCase;
  /** 사용자에게 보일 문구 */
  message: string;
  /** 있으면 그 필드 아래에, 없으면 폼 위 배너에 띄웁니다. */
  field?: "email" | "password";
  /** 이 실패를 풀 수 있는 다음 동작 */
  action?: "resend" | "login" | "reset";
}

type LinkErrorCase = Extract<
  AuthErrorCase,
  "link_expired" | "link_other_browser" | "link_invalid"
>;

const CODE_TO_CASE: Record<string, AuthErrorCase> = {
  invalid_credentials: "invalid_credentials",
  email_not_confirmed: "email_not_confirmed",
  user_already_exists: "user_already_exists",
  email_exists: "user_already_exists",
  weak_password: "weak_password",
  same_password: "same_password",
  email_address_invalid: "email_invalid",
  over_request_rate_limit: "rate_limited",
  over_email_send_rate_limit: "email_rate_limited",
  signup_disabled: "signup_disabled",
  email_provider_disabled: "signup_disabled",
  session_not_found: "session_missing",
  session_expired: "session_missing",
  refresh_token_not_found: "session_missing",
};

const LINK_CODE_TO_CASE: Record<string, LinkErrorCase> = {
  otp_expired: "link_expired",
  flow_state_expired: "link_expired",
  bad_code_verifier: "link_other_browser",
  flow_state_not_found: "link_other_browser",
  pkce_code_verifier_not_found: "link_other_browser",
};

/** `constructor` 같은 프로토타입 키가 표에서 걸리지 않게 자기 키만 봅니다. */
function lookup<T>(table: Record<string, T>, key: string | null | undefined): T | undefined {
  return key && Object.hasOwn(table, key) ? table[key] : undefined;
}

/**
 * 비밀번호 규칙. Supabase 대시보드(Auth → Email)의 설정과 같아야 합니다
 * — 최소 6자, Letters and digits (2026-10-01). 대시보드를 바꾸면 여기도
 * 바꾸세요. 어긋나면 화면이 통과시킨 비밀번호를 서버가 거절합니다.
 *
 * 최대 길이는 bcrypt 한계라 Supabase가 바이트로 셉니다. 넘으면
 * `weak_password`가 아니라 `validation_failed`로 오므로 먼저 막습니다.
 */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_HINT = `영문·숫자 포함 ${PASSWORD_MIN_LENGTH}자 이상`;

const PASSWORD_TOO_LONG_MESSAGE = `비밀번호가 너무 길어요. ${PASSWORD_MAX_BYTES}자 이하로 정해 주세요.`;

/** 서버의 `weak_password` 이유와 화면의 사전 검사가 같은 문구를 씁니다. */
function weakPasswordMessage(reasons: readonly string[]): string {
  if (reasons.includes("pwned")) {
    return "유출된 적 있는 비밀번호예요. 다른 비밀번호를 써 주세요.";
  }
  const short = reasons.includes("length");
  const mixed = reasons.includes("characters");
  if (short && mixed) {
    return `비밀번호는 영문과 숫자를 섞어 ${PASSWORD_MIN_LENGTH}자 이상으로 정해 주세요.`;
  }
  if (mixed) return "비밀번호에 영문과 숫자를 섞어 주세요.";
  return `비밀번호가 너무 짧아요. ${PASSWORD_MIN_LENGTH}자 이상으로 정해 주세요.`;
}

/**
 * 제출 전에 비밀번호를 검사합니다. 문제가 없으면 null입니다.
 * 길이와 문자 조합이 함께 틀리면 한 번에 안내합니다 — 서버를 거치면
 * 하나씩 고칠 때마다 다른 오류를 만나게 됩니다.
 */
export function checkPassword(password: string): string | null {
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return PASSWORD_TOO_LONG_MESSAGE;
  }
  const reasons: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) reasons.push("length");
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    reasons.push("characters");
  }
  return reasons.length > 0 ? weakPasswordMessage(reasons) : null;
}

function failure(
  kind: AuthErrorCase,
  ctx: AuthErrorContext,
  weakReasons: readonly string[] = [],
): AuthFailure {
  switch (kind) {
    case "invalid_credentials":
      return {
        case: kind,
        message: "이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요.",
        action: "reset",
      };
    case "email_not_confirmed":
      return {
        case: kind,
        message:
          "아직 이메일 인증을 하지 않았어요. 가입할 때 받은 메일의 링크를 눌러 주세요.",
        action: "resend",
      };
    case "user_already_exists":
      return {
        case: kind,
        message: "이미 가입된 이메일이에요. 로그인해 주세요.",
        field: "email",
        action: "login",
      };
    case "weak_password":
      return {
        case: kind,
        message: weakPasswordMessage(weakReasons.length > 0 ? weakReasons : ["length"]),
        field: "password",
      };
    case "password_too_long":
      return { case: kind, message: PASSWORD_TOO_LONG_MESSAGE, field: "password" };
    case "same_password":
      return {
        case: kind,
        message: "지금 쓰는 비밀번호와 같아요. 다른 비밀번호를 정해 주세요.",
        field: "password",
      };
    case "email_invalid":
      return {
        case: kind,
        message: "이메일 형식이 맞지 않아요. 다시 확인해 주세요.",
        field: "email",
      };
    case "rate_limited":
      return { case: kind, message: "시도가 너무 많아요. 잠시 후 다시 시도해 주세요." };
    case "email_rate_limited":
      return {
        case: kind,
        message: "메일을 너무 자주 보냈어요. 몇 분 뒤 다시 시도해 주세요.",
      };
    case "signup_disabled":
      return {
        case: kind,
        message: "지금은 가입을 받지 않아요. 잠시 후 다시 시도해 주세요.",
      };
    case "network":
      return {
        case: kind,
        message:
          "서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
      };
    case "session_missing":
      return ctx === "update"
        ? {
            case: kind,
            message: "재설정 링크가 만료됐어요. 비밀번호 찾기를 다시 요청해 주세요.",
            action: "reset",
          }
        : { case: kind, message: "로그인이 풀렸어요. 다시 로그인해 주세요." };
    case "link_expired":
      return {
        case: kind,
        message: "인증 링크가 만료됐어요. 인증 메일을 다시 받아 주세요.",
        action: "resend",
      };
    case "link_other_browser":
      return {
        case: kind,
        message:
          "링크를 요청한 브라우저와 다른 곳에서 열었어요. 같은 브라우저에서 다시 열어 주세요.",
      };
    case "link_invalid":
      return {
        case: kind,
        message: "링크가 올바르지 않거나 이미 사용됐어요. 다시 로그인해 주세요.",
      };
    case "unknown":
      return { case: kind, message: "잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };
  }
}

/** 이 케이스를 그대로 문구로 만듭니다. 판정을 이미 끝낸 곳(중복 가입 등)에서 씁니다. */
export function authFailure(kind: AuthErrorCase, ctx: AuthErrorContext): AuthFailure {
  return failure(kind, ctx);
}

/** Supabase가 던지거나 돌려준 에러를 케이스별 안내로 바꿉니다. */
export function toAuthFailure(error: unknown, ctx: AuthErrorContext): AuthFailure {
  if (isAuthRetryableFetchError(error) || error instanceof TypeError) {
    return failure("network", ctx);
  }
  if (isAuthWeakPasswordError(error)) {
    return failure("weak_password", ctx, error.reasons);
  }
  if (isAuthSessionMissingError(error)) {
    return failure("session_missing", ctx);
  }
  if (isAuthError(error)) {
    // validation_failed는 형식 오류 전반에 쓰입니다. 비밀번호만 보내는
    // 재설정에서는 비밀번호 문제이고, 나머지 흐름에서는 이메일 문제입니다
    // (비밀번호 길이는 checkPassword()가 먼저 막습니다).
    if (error.code === "validation_failed") {
      return failure(ctx === "update" ? "password_too_long" : "email_invalid", ctx);
    }
    const kind = lookup(CODE_TO_CASE, error.code);
    if (kind) return failure(kind, ctx);
    if (error.status === 429) return failure("rate_limited", ctx);
  }

  console.error("[auth] 분류하지 못한 인증 에러", error);
  return failure("unknown", ctx);
}

/** 인증 링크(가입 확인·비밀번호 재설정) 실패 코드를 케이스로 바꿉니다. */
export function linkErrorCase(code: string | null | undefined): LinkErrorCase {
  return lookup(LINK_CODE_TO_CASE, code) ?? "link_invalid";
}

/**
 * Supabase가 콜백 주소에 붙여 보낸 `error` / `error_code`를 읽습니다.
 * 실패 표시가 없으면 null입니다.
 */
export function linkErrorFromParams(params: URLSearchParams): LinkErrorCase | null {
  const code = params.get("error_code");
  if (!code && !params.get("error")) return null;
  return linkErrorCase(code);
}

const QUERY_FAILURES: Record<string, () => AuthFailure> = {
  link_expired: () => failure("link_expired", "signin"),
  link_other_browser: () => failure("link_other_browser", "signin"),
  link_invalid: () => failure("link_invalid", "signin"),
  // 비밀번호 재설정 링크가 만료됐을 때. 인증 메일이 아니라 재설정을 다시 요청해야 합니다.
  reset_link_expired: () => failure("session_missing", "update"),
  // 예전 콜백이 보내던 값입니다. 이미 나간 메일의 링크를 위해 남깁니다.
  auth_failed: () => failure("link_invalid", "signin"),
};

/**
 * 로그인 화면의 `?error=`를 안내로 바꿉니다. 정해 둔 값만 받습니다 —
 * 쿼리 문자열을 그대로 띄우면 누구나 링크로 아무 문구나 보여 줄 수 있습니다.
 */
export function authFailureFromQuery(value: string | null | undefined): AuthFailure | null {
  return lookup(QUERY_FAILURES, value)?.() ?? null;
}
