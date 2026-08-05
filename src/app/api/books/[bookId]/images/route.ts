import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";

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
 */

type Params = { params: Promise<{ bookId: string }> };

const BUCKET = "chapter-images";

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 00002의 file_size_limit와 같은 값

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { bookId } = await params;
  const supabase = await createClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("owner_id")
    .eq("id", bookId)
    .single();

  if (bookError || !book) return apiError("Book not found", "NOT_FOUND", 404);
  if (book.owner_id !== user.id) return apiError("Access denied", "FORBIDDEN", 403);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError("Expected multipart/form-data", "UPLOAD_ERROR", 400);
  }

  const file = formData.get("image");
  if (!file || !(file instanceof Blob)) {
    return apiError("No image provided in form field 'image'", "UPLOAD_ERROR", 400);
  }

  const extension = EXTENSION_BY_MIME[file.type];
  if (!extension) {
    return apiError(
      "Invalid file type. Allowed: JPEG, PNG, WebP, GIF",
      "UPLOAD_ERROR",
      415,
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return apiError("Image too large. Maximum size is 5MB", "UPLOAD_ERROR", 413);
  }

  const chapterId = formData.get("chapterId");
  if (typeof chapterId !== "string" || chapterId === "") {
    return apiError("chapterId is required", "VALIDATION_ERROR", 400);
  }

  // 챕터가 이 책의 것인지 확인합니다. 확인하지 않으면 남의 챕터 폴더
  // 아래에 파일이 쌓여 챕터 삭제 시 정리가 어긋납니다.
  const { data: chapter } = await supabase
    .from("chapters")
    .select("id")
    .eq("id", chapterId)
    .eq("book_id", bookId)
    .single();

  if (!chapter) return apiError("Chapter not found in this book", "NOT_FOUND", 404);

  const storagePath = `${bookId}/${chapterId}/${nanoid(16)}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return apiError(`Upload failed: ${uploadError.message}`, "UPLOAD_ERROR", 500);
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  return apiSuccess({ url: urlData.publicUrl, path: storagePath }, 201);
}
