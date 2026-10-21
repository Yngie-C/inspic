import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { isUuid } from "@/lib/template-node-id";
import { readImageUpload, type ImageMime } from "@/lib/image-upload";
import { COVERS_BUCKET, removeCoverFile } from "@/lib/storage-cleanup";

/**
 * 책 이미지(표지·소개 이미지) 올리기/지우기 라우트.
 *
 * 둘 다 covers 버킷의 `covers/{bookId}/` 아래에 두고 책 행의 URL 컬럼 하나를
 * 바꿉니다. 순서 규칙(새 파일 → 책 행 → 옛 파일)이 갈라지지 않게 한 벌로 둡니다.
 */

type Params = { params: Promise<{ bookId: string }> };

export type BookImageColumn = "cover_image_url" | "detail_image_url";

interface BookImageConfig {
  column: BookImageColumn;
  /** 파일명 앞머리. 표지는 빈 문자열입니다. */
  filePrefix: string;
  /** 안내 문구에 들어가는 이름과 목적격 조사. 예: "표지를" */
  objectLabel: string;
  logTag: string;
}

const ALLOWED_IMAGE_TYPES: readonly ImageMime[] = ["image/jpeg", "image/png", "image/webp"];

const BOOK_NOT_FOUND = "책을 찾을 수 없어요.";

export function bookImageHandlers({ column, filePrefix, objectLabel, logTag }: BookImageConfig) {
  const uploadFailed = `${objectLabel} 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.`;

  type OwnedBook =
    | { ok: true; imageUrl: string | null }
    | { ok: false; response: Response };

  async function loadOwnedBook(
    supabase: Awaited<ReturnType<typeof createClient>>,
    bookId: string,
    userId: string,
  ): Promise<OwnedBook> {
    const { data: book, error } = await supabase
      .from("books")
      .select(`owner_id, ${column}`)
      .eq("id", bookId)
      .maybeSingle();

    if (error) {
      console.error(`[${logTag}] 책을 읽지 못했습니다`, { bookId, error });
      return { ok: false, response: apiError(uploadFailed, "SERVER_ERROR", 500) };
    }
    if (!book) return { ok: false, response: apiError(BOOK_NOT_FOUND, "NOT_FOUND", 404) };
    const row = book as unknown as { owner_id: string } & Record<BookImageColumn, string | null>;
    if (row.owner_id !== userId) {
      return {
        ok: false,
        response: apiError(`이 책의 ${objectLabel} 바꿀 수 없어요.`, "FORBIDDEN", 403),
      };
    }
    return { ok: true, imageUrl: row[column] ?? null };
  }

  /**
   * 교체. 순서는 새 파일 올리기 → 책 행 갱신 → 옛 파일 지우기입니다.
   *
   * 옛 파일을 먼저 지우면 업로드나 갱신이 실패했을 때 책이 지워진 파일을
   * 가리켜 이미지가 깨집니다(코드 리뷰 5-P1-7). 갱신이 실패하면 방금 올린
   * 파일을 지웁니다.
   */
  async function POST(request: NextRequest, { params }: Params) {
    const user = await getAuthUser();
    if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

    const { bookId } = await params;
    if (!isUuid(bookId)) return apiError(BOOK_NOT_FOUND, "NOT_FOUND", 404);

    const supabase = await createClient();
    const book = await loadOwnedBook(supabase, bookId, user.id);
    if (!book.ok) return book.response;

    const upload = await readImageUpload(request, ALLOWED_IMAGE_TYPES, "JPEG, PNG, WebP");
    if (!upload.ok) return apiError(upload.message, "UPLOAD_ERROR", upload.status);

    const storagePath = `covers/${bookId}/${filePrefix}${Date.now()}.${upload.extension}`;

    const { error: uploadError } = await supabase.storage
      .from(COVERS_BUCKET)
      .upload(storagePath, upload.bytes, {
        contentType: upload.mime,
        upsert: false,
      });

    if (uploadError) {
      console.error(`[${logTag}] 파일을 올리지 못했습니다`, { bookId, uploadError });
      return apiError(uploadFailed, "UPLOAD_ERROR", 500);
    }

    const { data: urlData } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(storagePath);
    const imageUrl = urlData.publicUrl;

    const { data: updatedBook, error: updateError } = await supabase
      .from("books")
      .update({ [column]: imageUrl, updated_at: new Date().toISOString() })
      .eq("id", bookId)
      .select()
      .single();

    if (updateError) {
      console.error(`[${logTag}] 책에 이미지를 기록하지 못했습니다`, { bookId, updateError });
      await removeCoverFile(supabase, imageUrl, bookId);
      return apiError(uploadFailed, "SERVER_ERROR", 500);
    }

    if (book.imageUrl && book.imageUrl !== imageUrl) {
      await removeCoverFile(supabase, book.imageUrl, bookId);
    }

    return apiSuccess({ [column]: imageUrl, book: updatedBook }, 200);
  }

  /** 삭제. 책 행을 먼저 비우고, 성공한 뒤에 파일을 지웁니다. */
  async function DELETE(_request: NextRequest, { params }: Params) {
    const user = await getAuthUser();
    if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

    const { bookId } = await params;
    if (!isUuid(bookId)) return apiError(BOOK_NOT_FOUND, "NOT_FOUND", 404);

    const supabase = await createClient();
    const book = await loadOwnedBook(supabase, bookId, user.id);
    if (!book.ok) return book.response;

    if (!book.imageUrl) {
      return apiSuccess({ deleted: false });
    }

    const { error: updateError } = await supabase
      .from("books")
      .update({ [column]: null, updated_at: new Date().toISOString() })
      .eq("id", bookId);

    if (updateError) {
      console.error(`[${logTag}] 이미지를 지우지 못했습니다`, { bookId, updateError });
      return apiError(
        `${objectLabel} 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.`,
        "SERVER_ERROR",
        500,
      );
    }

    await removeCoverFile(supabase, book.imageUrl, bookId);

    return apiSuccess({ deleted: true });
  }

  return { POST, DELETE };
}
