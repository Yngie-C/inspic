/**
 * 표지(`/api/books/[bookId]/cover`)와 본문 이미지(`/api/books/[bookId]/images`)
 * 업로드가 함께 쓰는 검사입니다.
 *
 * 파일 종류는 클라이언트가 보낸 `file.type`이 아니라 파일 앞머리(매직 바이트)로
 * 정합니다. `file.type`은 브라우저가 확장자로 짐작하거나 요청을 만든 쪽이
 * 마음대로 적는 값이라, HTML을 `image/png`라고 적어 올릴 수 있습니다.
 */

export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export const EXTENSION_BY_MIME: ReadonlyMap<ImageMime, string> = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

/** 5MB. `chapter-images` 버킷의 file_size_limit(00002)와 같은 값입니다. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** multipart 경계·헤더·다른 필드가 차지하는 몫. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const ASCII = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** 파일 앞머리로 이미지 종류를 판정합니다. 모르는 형식이면 null. */
export function sniffImageType(bytes: Uint8Array): ImageMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, ASCII("RIFF")) && startsWith(bytes, ASCII("WEBP"), 8)) return "image/webp";
  if (startsWith(bytes, ASCII("GIF87a")) || startsWith(bytes, ASCII("GIF89a"))) return "image/gif";
  return null;
}

export type ImageUpload =
  | { ok: true; bytes: Uint8Array; mime: ImageMime; extension: string; formData: FormData }
  | { ok: false; message: string; status: 400 | 413 | 415 };

const TOO_LARGE = "이미지는 5MB 이하만 올릴 수 있어요.";

/**
 * 요청에서 `image` 필드를 읽어 검사합니다.
 *
 * `Content-Length`가 상한을 넘으면 본문을 읽지 않고 413입니다. `formData()`는
 * 본문 전체를 메모리에 올리므로, 크기 검사를 그 뒤에 두면 큰 요청 하나가 그만큼
 * 메모리를 씁니다. 길이를 밝히지 않은 요청(chunked)은 읽은 뒤에 다시 잽니다.
 */
export async function readImageUpload(
  request: Request,
  allowed: readonly ImageMime[],
  allowedLabel: string,
): Promise<ImageUpload> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > MAX_IMAGE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return { ok: false, message: TOO_LARGE, status: 413 };
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return { ok: false, message: "이미지를 읽지 못했어요. 다시 올려 주세요.", status: 400 };
  }

  const file = formData.get("image");
  if (!(file instanceof Blob)) {
    return { ok: false, message: "올릴 이미지를 골라 주세요.", status: 400 };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: TOO_LARGE, status: 413 };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageType(bytes);
  if (!mime || !allowed.includes(mime)) {
    return {
      ok: false,
      message: `${allowedLabel} 이미지만 올릴 수 있어요.`,
      status: 415,
    };
  }

  return { ok: true, bytes, mime, extension: EXTENSION_BY_MIME.get(mime)!, formData };
}
