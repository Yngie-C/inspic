import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { isUuid } from "@/lib/template-node-id";
import { readImageUpload } from "@/lib/image-upload";
import { COVERS_BUCKET, coverStoragePath } from "@/lib/storage-cleanup";
import {
  clearStoredImage,
  replaceStoredImage,
  STORED_IMAGE_TYPES,
  STORED_IMAGE_TYPES_LABEL,
  type StoredImageTarget,
} from "@/lib/stored-image";

/**
 * 책 이미지(표지·소개 이미지) 올리기/지우기 라우트.
 *
 * 둘 다 covers 버킷의 `covers/{bookId}/` 아래에 두고 책 행의 URL 컬럼 하나를
 * 바꿉니다. 순서 규칙(새 파일 → 책 행 → 옛 파일)과 겹친 요청 처리는
 * `lib/stored-image.ts` 한 벌을 프로필 사진과 함께 씁니다.
 *
 * URL 컬럼은 사용자 권한으로는 바꿀 수 없습니다(00015 트리거). 소유자 확인을
 * 마친 뒤 그 컬럼 갱신만 admin 클라이언트로 씁니다.
 */

type Params = { params: Promise<{ bookId: string }> };

export type BookImageColumn = "cover_image_url" | "detail_image_url";

interface BookImageConfig {
  column: BookImageColumn;
  /** 파일명 앞머리. 표지는 빈 문자열입니다. */
  filePrefix: string;
  /**
   * 이미지가 바뀌거나 지워질 때 함께 비우는 컬럼. 소개 이미지의 대체 글은 옛
   * 이미지의 설명이라 새 이미지에 붙으면 화면 낭독기가 틀린 내용을 읽습니다
   * (코드 리뷰 10-P1-7, 결정 2).
   */
  resetColumns?: readonly string[];
  /** 안내 문구에 들어가는 이름과 목적격 조사. 예: "표지를" */
  objectLabel: string;
  logTag: string;
}

const BOOK_NOT_FOUND = "책을 찾을 수 없어요.";

export function bookImageHandlers({
  column,
  filePrefix,
  resetColumns,
  objectLabel,
  logTag,
}: BookImageConfig) {
  const uploadFailed = `${objectLabel} 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.`;
  const removeFailed = `${objectLabel} 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.`;

  type OwnedBook =
    | { ok: true; imageUrl: string | null }
    | { ok: false; response: Response };

  async function loadOwnedBook(
    supabase: Awaited<ReturnType<typeof createClient>>,
    bookId: string,
    userId: string,
    failed: string,
  ): Promise<OwnedBook> {
    const { data: book, error } = await supabase
      .from("books")
      .select(`owner_id, ${column}`)
      .eq("id", bookId)
      .maybeSingle();

    if (error) {
      console.error(`[${logTag}] 책을 읽지 못했습니다`, { bookId, error });
      return { ok: false, response: apiError(failed, "SERVER_ERROR", 500) };
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

  const targetFor = (bookId: string): StoredImageTarget => ({
    table: "books",
    key: { column: "id", value: bookId },
    column,
    resetColumns,
    bucket: COVERS_BUCKET,
    pathOf: (url) => coverStoragePath(url, bookId),
    notFound: BOOK_NOT_FOUND,
    logTag,
  });

  /** 비운 컬럼까지 응답에 실어 폼이 서버 값으로 맞추게 합니다. */
  const resetValues = () =>
    Object.fromEntries((resetColumns ?? []).map((name) => [name, null]));

  /** 교체. 순서는 새 파일 올리기 → 책 행 갱신 → 옛 파일 지우기입니다. */
  async function POST(request: NextRequest, { params }: Params) {
    const user = await getAuthUser();
    if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

    const { bookId } = await params;
    if (!isUuid(bookId)) return apiError(BOOK_NOT_FOUND, "NOT_FOUND", 404);

    const supabase = await createClient();
    // 환경변수가 빠져 있으면 파일을 올리기 전에 실패하게 먼저 만듭니다.
    const admin = createAdminClient();
    const book = await loadOwnedBook(supabase, bookId, user.id, uploadFailed);
    if (!book.ok) return book.response;

    const upload = await readImageUpload(request, STORED_IMAGE_TYPES, STORED_IMAGE_TYPES_LABEL);
    if (!upload.ok) return apiError(upload.message, "UPLOAD_ERROR", upload.status);

    // 시각만으로 이름을 지으면 같은 ms의 두 요청 중 하나가 중복으로 실패합니다(10-P2-4).
    const path = `covers/${bookId}/${filePrefix}${crypto.randomUUID()}.${upload.extension}`;
    const result = await replaceStoredImage({
      supabase,
      admin,
      target: targetFor(bookId),
      current: book.imageUrl,
      upload,
      path,
      failed: uploadFailed,
    });
    if (!result.ok) return result.response;

    return apiSuccess({ [column]: result.value, ...resetValues() }, 200);
  }

  /** 삭제. 책 행을 먼저 비우고, 성공한 뒤에 파일을 지웁니다. */
  async function DELETE(_request: NextRequest, { params }: Params) {
    const user = await getAuthUser();
    if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

    const { bookId } = await params;
    if (!isUuid(bookId)) return apiError(BOOK_NOT_FOUND, "NOT_FOUND", 404);

    const supabase = await createClient();
    // 환경변수가 빠져 있으면 DB에 묻기 전에 실패하게 먼저 만듭니다.
    const admin = createAdminClient();
    const book = await loadOwnedBook(supabase, bookId, user.id, removeFailed);
    if (!book.ok) return book.response;

    const result = await clearStoredImage({
      admin,
      target: targetFor(bookId),
      current: book.imageUrl,
      failed: removeFailed,
    });
    if (!result.ok) return result.response;

    return apiSuccess({ deleted: result.value, ...(result.value ? resetValues() : {}) });
  }

  return { POST, DELETE };
}
