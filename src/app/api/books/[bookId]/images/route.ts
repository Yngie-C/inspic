import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { isUuid } from "@/lib/template-node-id";
import { readImageUpload, type ImageMime } from "@/lib/image-upload";
import { CHAPTER_IMAGES_BUCKET } from "@/lib/storage-cleanup";

/**
 * 에디터 본문 이미지 업로드.
 *
 * 이전에는 브라우저에서 base64 data URL로 만들어 본문 HTML에 그대로
 * 박았습니다. 그러면 이미지 한 장이 챕터 본문을 수십 KB씩 부풀리고,
 * `content_html`의 500,000자 제한에 금방 닿습니다. 저장은 여기,
 * 본문에는 URL만 둡니다.
 *
 * 경로 규약: chapter-images/{bookId}/{chapterId}/{임의값}.{확장자}
 * Storage 정책이 첫 폴더를 책 ID로 읽어 소유권을 판정합니다
 * (마이그레이션 00002). 순서를 바꾸면 정책이 통과하지 않습니다.
 * 장·책을 지우면 그 폴더의 파일도 지웁니다(`removeChapterImages()`).
 */

type Params = { params: Promise<{ bookId: string }> };

const ALLOWED_IMAGE_TYPES: readonly ImageMime[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const BOOK_NOT_FOUND = "책을 찾을 수 없어요.";
const UPLOAD_FAILED = "이미지를 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.";

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("로그인이 필요해요.", "UNAUTHORIZED", 401);

  const { bookId } = await params;
  if (!isUuid(bookId)) return apiError(BOOK_NOT_FOUND, "NOT_FOUND", 404);

  const supabase = await createClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("owner_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[images] 책을 읽지 못했습니다", { bookId, bookError });
    return apiError(UPLOAD_FAILED, "SERVER_ERROR", 500);
  }
  if (!book) return apiError(BOOK_NOT_FOUND, "NOT_FOUND", 404);
  if (book.owner_id !== user.id) {
    return apiError("이 책에 이미지를 올릴 수 없어요.", "FORBIDDEN", 403);
  }

  const upload = await readImageUpload(request, ALLOWED_IMAGE_TYPES, "JPEG, PNG, WebP, GIF");
  if (!upload.ok) return apiError(upload.message, "UPLOAD_ERROR", upload.status);

  const chapterId = upload.formData.get("chapterId");
  if (typeof chapterId !== "string" || !isUuid(chapterId)) {
    return apiError("장을 찾을 수 없어요. 장을 저장한 뒤 다시 올려 주세요.", "VALIDATION_ERROR", 400);
  }

  // 챕터가 이 책의 것인지 확인합니다. 확인하지 않으면 남의 챕터 폴더
  // 아래에 파일이 쌓여 챕터 삭제 시 정리가 어긋납니다.
  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .select("id")
    .eq("id", chapterId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (chapterError) {
    console.error("[images] 장을 읽지 못했습니다", { bookId, chapterId, chapterError });
    return apiError(UPLOAD_FAILED, "SERVER_ERROR", 500);
  }
  if (!chapter) return apiError("이 책에서 장을 찾을 수 없어요.", "NOT_FOUND", 404);

  const storagePath = `${bookId}/${chapterId}/${nanoid(16)}.${upload.extension}`;

  const { error: uploadError } = await supabase.storage
    .from(CHAPTER_IMAGES_BUCKET)
    .upload(storagePath, upload.bytes, {
      contentType: upload.mime,
      upsert: false,
    });

  if (uploadError) {
    console.error("[images] 이미지를 올리지 못했습니다", { bookId, chapterId, uploadError });
    return apiError(UPLOAD_FAILED, "UPLOAD_ERROR", 500);
  }

  const { data: urlData } = supabase.storage
    .from(CHAPTER_IMAGES_BUCKET)
    .getPublicUrl(storagePath);

  return apiSuccess({ url: urlData.publicUrl, path: storagePath }, 201);
}
