import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAuthUser,
  apiError,
  apiSuccess,
  readJsonObject,
} from "@/lib/api-utils";
import {
  BOOK_LANGUAGES,
  BOOK_VISIBILITIES,
  EDITABLE_BOOK_STATUSES,
  INVALID_BODY_MESSAGE,
  isOneOf,
  readBookTitle,
} from "@/lib/authoring-input";
import { loadPublishChecks } from "@/lib/publish-checks-loader";
import { removeBookFiles } from "@/lib/storage-cleanup";
import { blockers } from "@/lib/publish-checks";

type Params = { params: Promise<{ bookId: string }> };

/** Postgres foreign_key_violation. */
const FOREIGN_KEY_VIOLATION = "23503";

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
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

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
    .select("owner_id, status, visibility, published_at, language")
    .eq("id", bookId)
    .single();

  if (fetchError || !existing) return apiError("Book not found", "NOT_FOUND", 404);
  if (existing.owner_id !== user.id) return apiError("Access denied", "FORBIDDEN", 403);

  const body = await readJsonObject(request);
  if (!body) return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);

  // 타입 선언만 믿으면 `{title:null}`·`{status:'PUBLISHED'}`가 DB 원문
  // 500이 되고, `{status:'processing'}`이나 임의 언어가 그대로 저장되고,
  // 출간된 책에 `{title:''}`을 보내면 검수를 건너뛰어 제목 없는 공개 책이
  // 됩니다(코드 리뷰 4-P1-17).
  const updates: Record<string, unknown> = {};

  if ("title" in body) {
    const title = readBookTitle(body.title);
    if (!title.ok) return apiError(title.message, "VALIDATION_ERROR", 400);
    updates.title = title.value;
  }
  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
    }
    updates.description =
      typeof body.description === "string" ? body.description.trim() || null : null;
  }
  // 업로드는 언어를 자유롭게 받았으므로, 목록 밖이어도 지금 값 그대로면
  // 받습니다 — 설정 폼은 제목만 고쳐도 현재 언어를 함께 보냅니다.
  if ("language" in body) {
    if (
      !isOneOf(BOOK_LANGUAGES, body.language) &&
      body.language !== existing.language
    ) {
      return apiError("고를 수 없는 언어예요.", "VALIDATION_ERROR", 400);
    }
    updates.language = body.language;
  }
  if ("status" in body) {
    if (!isOneOf(EDITABLE_BOOK_STATUSES, body.status)) {
      return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
    }
    updates.status = body.status;
  }
  if ("visibility" in body) {
    if (!isOneOf(BOOK_VISIBILITIES, body.visibility)) {
      return apiError(INVALID_BODY_MESSAGE, "VALIDATION_ERROR", 400);
    }
    updates.visibility = body.visibility;
  }
  // 표지는 `/cover` 업로드로만 바꿉니다. 거기서 파일을 검사하고 이전
  // 파일을 정리합니다. 여기서 아무 URL이나 받으면 외부 추적 픽셀이 공개
  // 카드에 뜨고, 남의 책 경로를 넣은 뒤 표지 삭제를 부를 수 있습니다
  // (4-P1-18).
  if ("cover_image_url" in body) {
    return apiError(
      "표지는 표지 올리기로 바꿔 주세요.",
      "VALIDATION_ERROR",
      400,
    );
  }

  if (Object.keys(updates).length === 0) {
    return apiError("바꿀 내용이 없어요.", "VALIDATION_ERROR", 400);
  }

  // "링크 공유"는 열어 주는 경로가 없어(has_book_access·is_book_public
  // 모두 public만 봅니다) 고르면 아무에게도 보이지 않습니다. 화면에서
  // 선택지를 뺐고, 새로 고르는 것은 여기서 막습니다. 이미 그 값인 책은
  // DB에 그대로 둡니다 — 설정 폼은 제목만 고쳐도 현재 visibility를 함께
  // 보내므로, 그대로인 값까지 막으면 그 책은 아무것도 저장하지 못합니다.
  if (body.visibility === "unlisted" && existing.visibility !== "unlisted") {
    return apiError(
      "링크 공유는 더 이상 고를 수 없어요. 공개나 비공개를 골라 주세요.",
      "VALIDATION_ERROR",
      400,
    );
  }

  // 공개는 status와 visibility가 함께 바뀌어야 합니다. `{status:'published'}`
  // 만 보내면 published + private이라 아무도 못 보는 책에 출간일이 찍히고,
  // 그 뒤 visibility만 바꾸는 공개가 검수를 건너뛰었습니다(4-P1-16).
  // 출간으로 넘어가며 visibility를 정하지 않았으면 공개로 둡니다.
  if (
    updates.status === "published" &&
    existing.status !== "published" &&
    !("visibility" in updates)
  ) {
    updates.visibility = "public";
  }

  // 독자에게 보이게 되는 모든 전환에서 검수합니다 — 출간이든, 내렸던 책을
  // 다시 공개로 돌리는 것이든. 이미 공개된 책의 제목을 고치는 것까지 막으면
  // 크리에이터가 오탈자를 못 고칩니다.
  const nextStatus = updates.status ?? existing.status;
  const nextVisibility = updates.visibility ?? existing.visibility;
  const wasPublic =
    existing.status === "published" && existing.visibility === "public";
  const becomesPublic =
    !wasPublic && nextStatus === "published" && nextVisibility === "public";

  if (becomesPublic) {
    // 검수는 UPDATE 바로 앞에서 돌립니다. 그 사이에 끼는 자동 저장은 공개
    // 뒤의 편집과 같고, 편집 화면 배너가 계속 보여 줍니다(4-P1-12 결정).
    const result = await loadPublishChecks(supabase, bookId);
    if (!result.ok) {
      return result.reason === "not-found"
        ? apiError("Book not found", "NOT_FOUND", 404)
        : apiError("검수하지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
    }

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

  if (error) {
    console.error("[books] 책을 저장하지 못했습니다", { bookId, error });
    return apiError("저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }

  return apiSuccess(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { bookId } = await params;
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("books")
    .select("owner_id, cover_image_url")
    .eq("id", bookId)
    .single();

  if (fetchError || !existing) return apiError("Book not found", "NOT_FOUND", 404);
  if (existing.owner_id !== user.id) return apiError("Access denied", "FORBIDDEN", 403);

  // 챕터·블록·독자 답은 FK CASCADE로 함께 지워집니다. 따로 먼저 지우면
  // 책 삭제가 실패했을 때 본문만 사라진 책이 남습니다.
  //
  // 결제·구매 기록이 있는 책은 FK(RESTRICT, 마이그레이션 00006)가
  // 삭제를 거절합니다. 판매된 책은 지우지 않고 내립니다 — 산 독자는
  // 비공개가 된 뒤에도 계속 읽습니다.
  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return apiError(
        "판매 기록이 있는 책은 삭제할 수 없어요. 대신 비공개로 전환해 주세요. 이미 구매한 독자는 계속 읽을 수 있어요.",
        "HAS_SALES",
        409,
      );
    }
    console.error("[books] 책을 삭제하지 못했습니다", { bookId, error });
    return apiError("책을 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }

  // 파일은 책이 지워진 뒤에 지웁니다. 먼저 지우면 삭제가 거절됐을 때(판매된
  // 책) 산 독자의 표지·본문 이미지가 깨집니다.
  await removeBookFiles(bookId, existing.cover_image_url);

  return apiSuccess({ deleted: true });
}
