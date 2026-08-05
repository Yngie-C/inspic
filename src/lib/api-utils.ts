import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "UPLOAD_ERROR"
  | "PUBLISH_BLOCKED"
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

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}
