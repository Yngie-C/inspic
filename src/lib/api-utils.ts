import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "CONTENT_TOO_LONG"
  | "UPLOAD_ERROR"
  | "PUBLISH_BLOCKED"
  | "HAS_SALES"
  | "SERVER_ERROR";

export async function getAuthUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * `details`는 클라이언트가 사람에게 보여 줄 구조화된 정보입니다
 * (예: 공개 전 검수에서 걸린 항목 목록). 내부 오류 내용을 담지 마세요.
 */
export function apiError(
  message: string,
  code: ErrorCode,
  status: number,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    details ? { error: message, code, ...details } : { error: message, code },
    { status },
  );
}

/**
 * 요청 본문을 JSON 객체로 읽습니다. 깨진 JSON·`null`·배열·원시값이면
 * `null`입니다.
 *
 * `request.json()`만으로는 본문이 `null`일 때 다음 줄의 `'title' in body`나
 * 구조 분해가 TypeError로 던져 처리되지 않은 500이 됩니다(코드 리뷰
 * 4-P1-11, 4-P1-17). 필드 하나하나의 타입은 호출부가 봅니다.
 */
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}
