/**
 * 에디터 본문 이미지 올리기. 이미지 버튼·붙여넣기·끌어 넣기가 같은 경로를 씁니다.
 *
 * 본문에는 `chapter-images`의 URL만 둡니다. 붙여 넣은 이미지를 base64(`data:`)로
 * 넣으면 스크린샷 몇 장에 본문 상한(50만 자)을 넘어 그 뒤 저장이 모두 실패하고,
 * sanitize도 `data:` 이미지를 지웁니다(코드 리뷰 12-P1-9).
 */

/** `/api/books/[bookId]/images`가 받는 형식. */
export const EDITOR_IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * 붙여넣기·끌어 넣기에서 올릴 이미지 파일. 글(HTML·텍스트)이 함께 오면 빈
 * 목록입니다 — Word·웹 페이지에서 복사하면 선택 영역을 그린 그림이 함께 실려
 * 오는데, 그것을 올리면 저자가 붙이려던 글 대신 그림 한 장이 들어갑니다.
 */
export function imageFilesFrom(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const hasText = ["text/html", "text/plain"].some((type) => data.getData(type).trim() !== "");
  if (hasText) return [];
  return Array.from(data.files).filter((file) => EDITOR_IMAGE_TYPES.includes(file.type));
}

/** 이미지 하나를 올리고 공개 URL을 돌려줍니다. 실패하면 화면에 띄울 문구로 던집니다. */
export async function uploadChapterImage(
  bookId: string,
  chapterId: string,
  file: File,
): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("chapterId", chapterId);

  const res = await fetch(`/api/books/${bookId}/images`, {
    method: "POST",
    body: formData,
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { url?: unknown };
    error?: unknown;
  };
  if (!res.ok || typeof json.data?.url !== "string") {
    throw new Error(typeof json.error === "string" ? json.error : "이미지를 올리지 못했어요.");
  }
  return json.data.url;
}
