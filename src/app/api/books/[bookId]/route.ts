import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { loadPublishChecks } from "@/lib/publish-checks-loader";
import { blockers } from "@/lib/publish-checks";
import type { BookStatus, BookVisibility } from "@/types";

type Params = { params: Promise<{ bookId: string }> };

/**
 * 리더와 편집 화면이 함께 쓰는 조회.
 *
 * 로그인을 요구하지 않습니다. 무료 책은 비로그인도 읽고, 유료 책은
 * 첫 챕터가 미리보기로 열려 있기 때문입니다.
 *
 * **무엇이 보이는지는 RLS가 정합니다.** 여기서 다시 판정하지 않습니다.
 * `books_select_*`가 남의 비공개·미발행 책을 아예 안 돌려주고,
 * `chapters_select*`가 챕터 단위로 거릅니다 — 접근 권한이 있으면
 * published 챕터 전부, 없으면 미리보기 챕터 하나입니다.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser();

  const { bookId } = await params;
  const supabase = await createClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .single();

  if (bookError || !book) return apiError("Book not found", "NOT_FOUND", 404);

  const isOwner = !!user && book.owner_id === user.id;
  let chaptersQuery = supabase
    .from("chapters")
    .select("*")
    .eq("book_id", bookId)
    .order("order_index", { ascending: true });

  if (!isOwner) {
    chaptersQuery = chaptersQuery.eq("status", "published");
  }

  const { data: chapters, error: chaptersError } = await chaptersQuery;

  if (chaptersError) return apiError(chaptersError.message, "SERVER_ERROR", 500);

  return apiSuccess({ ...book, chapters: chapters ?? [] });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { bookId } = await params;
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("books")
    .select("owner_id, status, published_at")
    .eq("id", bookId)
    .single();

  if (fetchError || !existing) return apiError("Book not found", "NOT_FOUND", 404);
  if (existing.owner_id !== user.id) return apiError("Access denied", "FORBIDDEN", 403);

  let body: {
    title?: string;
    description?: string;
    language?: string;
    status?: BookStatus;
    visibility?: BookVisibility;
    cover_image_url?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  const allowedFields: (keyof typeof body)[] = [
    "title",
    "description",
    "language",
    "status",
    "visibility",
    "cover_image_url",
  ];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return apiError("No valid fields to update", "VALIDATION_ERROR", 400);
  }

  // 출간으로 넘어가는 순간에만 검수합니다. 이미 출간된 책의 제목을
  // 고치는 것까지 막으면 크리에이터가 오탈자를 못 고칩니다.
  const isPublishing =
    body.status === "published" && existing.status !== "published";

  if (isPublishing) {
    const result = await loadPublishChecks(supabase, bookId);
    if (!result.ok) return apiError("Book not found", "NOT_FOUND", 404);

    const failed = blockers(result.checks);
    if (failed.length > 0) {
      return apiError(
        `공개할 수 없어요: ${failed.map((check) => check.title).join(", ")}`,
        "PUBLISH_BLOCKED",
        422,
        { blockers: failed },
      );
    }

    // 출간 시각은 서버가 찍습니다. 한 번 출간한 책을 내렸다 다시 올릴 때
    // 최초 출간일이 밀리지 않도록 비어 있을 때만 채웁니다.
    if (!existing.published_at) {
      updates.published_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase
    .from("books")
    .update(updates)
    .eq("id", bookId)
    .select()
    .single();

  if (error) return apiError(error.message, "SERVER_ERROR", 500);

  return apiSuccess(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { bookId } = await params;
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("books")
    .select("owner_id")
    .eq("id", bookId)
    .single();

  if (fetchError || !existing) return apiError("Book not found", "NOT_FOUND", 404);
  if (existing.owner_id !== user.id) return apiError("Access denied", "FORBIDDEN", 403);

  // Cascade: delete chapters first
  await supabase.from("chapters").delete().eq("book_id", bookId);

  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) return apiError(error.message, "SERVER_ERROR", 500);

  return apiSuccess({ deleted: true });
}
