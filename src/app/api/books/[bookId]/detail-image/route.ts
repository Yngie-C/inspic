import { bookImageHandlers } from "@/lib/book-image-route";

/**
 * 책 소개 이미지(책 상세의 "책 소개" 아래 한 장) 교체·삭제. 선택사항입니다.
 * 파일은 표지와 같은 `covers/{bookId}/` 폴더에 `detail-` 이름으로 둡니다(00013).
 */
export const { POST, DELETE } = bookImageHandlers({
  column: "detail_image_url",
  filePrefix: "detail-",
  objectLabel: "소개 이미지를",
  logTag: "detail-image",
});
