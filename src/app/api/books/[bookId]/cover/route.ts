import { bookImageHandlers } from "@/lib/book-image-route";

/** 표지 교체·삭제. 순서 규칙은 `bookImageHandlers()`에 있습니다. */
export const { POST, DELETE } = bookImageHandlers({
  column: "cover_image_url",
  filePrefix: "",
  objectLabel: "표지를",
  logTag: "cover",
});
