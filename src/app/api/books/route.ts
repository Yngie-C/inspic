import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess, readJsonObject } from "@/lib/api-utils";
import {
  BOOK_LANGUAGES,
  INVALID_BODY_MESSAGE,
  isBookPrice,
  isOneOf,
  readBookTitle,
} from "@/lib/authoring-input";
import type { BookStatus, BookVisibility } from "@/types";

const SOURCE_TYPES = ["text", "markdown", "docx"] as const;

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as BookStatus | null;
  const visibility = searchParams.get("visibility") as BookVisibility | null;

  const supabase = await createClient();
  let query = supabase
    .from("books")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (visibility) query = query.eq("visibility", visibility);

  const { data, error } = await query;
  if (error) return apiError(error.message, "SERVER_ERROR", 500);

  return apiSuccess(data);
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  // PUT(`/api/books/[bookId]`)과 같은 규칙으로 읽습니다. 따로 두면 같은 값이
  // 만들 때와 고칠 때 다르게 저장됩니다(코드 리뷰 7-P2-10~13).
  const body = await readJsonObject(request);
  if (!body) return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);

  const title = readBookTitle(body.title);
  if (!title.ok) return apiError(title.message, "VALIDATION_ERROR", 400);

  if (!isOneOf(SOURCE_TYPES, body.source_type)) {
    return apiError(
      "source_type must be one of: text, markdown, docx",
      "VALIDATION_ERROR",
      400,
    );
  }

  if (
    body.description !== undefined &&
    body.description !== null &&
    typeof body.description !== "string"
  ) {
    return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
  }
  // 공백뿐인 소개글은 없는 것입니다 — 출간 검수의 "소개글 없음" 경고가 봅니다.
  const description =
    typeof body.description === "string" ? body.description.trim() || null : null;

  // PUT은 지금 값과 같으면 목록 밖 언어도 받으므로, 여기서 들어간 잘못된
  // 값은 고칠 길이 없습니다.
  if (body.language !== undefined && !isOneOf(BOOK_LANGUAGES, body.language)) {
    return apiError("고를 수 없는 언어예요.", "VALIDATION_ERROR", 400);
  }
  const language = body.language ?? "ko";

  // 가격은 만들 때만 정합니다. 보내지 않으면 무료이지만, 보냈는데 읽을 수
  // 없는 값(`"9900"`, `9900.5`)을 무료로 바꾸면 유료 책이 공짜로 나갑니다.
  if (body.price !== undefined && !isBookPrice(body.price)) {
    return apiError("가격은 0 이상의 정수(원)로 입력해 주세요.", "VALIDATION_ERROR", 400);
  }
  const price = body.price ?? 0;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("books")
    .insert({
      owner_id: user.id,
      title: title.value,
      description,
      language,
      source_type: body.source_type,
      status: "draft",
      visibility: "private",
      price,
    })
    .select()
    .single();

  if (error) {
    console.error("[books] 책을 만들지 못했습니다", error.message);
    return apiError("책을 만들지 못했어요.", "SERVER_ERROR", 500);
  }

  return apiSuccess(data, 201);
}
