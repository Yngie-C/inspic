import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { isUuid } from "@/lib/template-node-id";
import { readImageUpload, type ImageMime } from "@/lib/image-upload";
import { COVERS_BUCKET, removeCoverFile } from "@/lib/storage-cleanup";

type Params = { params: Promise<{ bookId: string }> };

const ALLOWED_IMAGE_TYPES: readonly ImageMime[] = ["image/jpeg", "image/png", "image/webp"];

const BOOK_NOT_FOUND = "책을 찾을 수 없어요.";
const UPLOAD_FAILED = "표지를 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.";

type OwnedBook =
  | { ok: true; coverUrl: string | null }
  | { ok: false; response: Response };

async function loadOwnedBook(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookId: string,
  userId: string,
): Promise<OwnedBook> {
  const { data: book, error } = await supabase
    .from("books")
    .select("owner_id, cover_image_url")
    .eq("id", bookId)
    .maybeSingle();

  if (error) {
    console.error("[cover] 책을 읽지 못했습니다", { bookId, error });
    return { ok: false, response: apiError(UPLOAD_FAILED, "SERVER_ERROR", 500) };
  }
  if (!book) return { ok: false, response: apiError(BOOK_NOT_FOUND, "NOT_FOUND", 404) };
  if (book.owner_id !== userId) {
    return { ok: false, response: apiError("이 책의 표지를 바꿀 수 없어요.", "FORBIDDEN", 403) };
  }
  return { ok: true, coverUrl: book.cover_image_url };
}

/**
 * 표지 교체. 순서는 새 파일 올리기 → 책 행 갱신 → 옛 파일 지우기입니다.
 *
 * 옛 파일을 먼저 지우면 업로드나 갱신이 실패했을 때 책이 지워진 파일을
 * 가리켜 표지가 깨집니다(코드 리뷰 5-P1-7). 갱신이 실패하면 방금 올린
 * 파일을 지웁니다.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const { bookId } = await params;
  if (!isUuid(bookId)) return apiError(BOOK_NOT_FOUND, "NOT_FOUND", 404);

  const supabase = await createClient();
  const book = await loadOwnedBook(supabase, bookId, user.id);
  if (!book.ok) return book.response;

  const upload = await readImageUpload(request, ALLOWED_IMAGE_TYPES, "JPEG, PNG, WebP");
  if (!upload.ok) return apiError(upload.message, "UPLOAD_ERROR", upload.status);

  const storagePath = `covers/${bookId}/${Date.now()}.${upload.extension}`;

  const { error: uploadError } = await supabase.storage
    .from(COVERS_BUCKET)
    .upload(storagePath, upload.bytes, {
      contentType: upload.mime,
      upsert: false,
    });

  if (uploadError) {
    console.error("[cover] 표지 파일을 올리지 못했습니다", { bookId, uploadError });
    return apiError(UPLOAD_FAILED, "UPLOAD_ERROR", 500);
  }

  const { data: urlData } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(storagePath);
  const coverUrl = urlData.publicUrl;

  const { data: updatedBook, error: updateError } = await supabase
    .from("books")
    .update({ cover_image_url: coverUrl, updated_at: new Date().toISOString() })
    .eq("id", bookId)
    .select()
    .single();

  if (updateError) {
    console.error("[cover] 책에 표지를 기록하지 못했습니다", { bookId, updateError });
    await removeCoverFile(supabase, coverUrl, bookId);
    return apiError(UPLOAD_FAILED, "SERVER_ERROR", 500);
  }

  if (book.coverUrl && book.coverUrl !== coverUrl) {
    await removeCoverFile(supabase, book.coverUrl, bookId);
  }

  return apiSuccess({ cover_image_url: coverUrl, book: updatedBook }, 200);
}

/** 표지 삭제. 책 행을 먼저 비우고, 성공한 뒤에 파일을 지웁니다. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const { bookId } = await params;
  if (!isUuid(bookId)) return apiError(BOOK_NOT_FOUND, "NOT_FOUND", 404);

  const supabase = await createClient();
  const book = await loadOwnedBook(supabase, bookId, user.id);
  if (!book.ok) return book.response;

  if (!book.coverUrl) {
    return apiSuccess({ deleted: false });
  }

  const { error: updateError } = await supabase
    .from("books")
    .update({ cover_image_url: null, updated_at: new Date().toISOString() })
    .eq("id", bookId);

  if (updateError) {
    console.error("[cover] 표지를 지우지 못했습니다", { bookId, updateError });
    return apiError("표지를 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.", "SERVER_ERROR", 500);
  }

  await removeCoverFile(supabase, book.coverUrl, bookId);

  return apiSuccess({ deleted: true });
}
