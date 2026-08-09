import { NextRequest } from "next/server";
import { getAuthUser, apiError } from "@/lib/api-utils";
import { generateEpub } from "@/lib/epub-generator";
import { exportFilename, loadExportSource } from "@/lib/export-source";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get("bookId");

  if (!bookId) {
    return apiError("bookId query parameter is required", "VALIDATION_ERROR", 400);
  }

  const user = await getAuthUser();
  const loaded = await loadExportSource(bookId, user?.id ?? null);

  if (!loaded.ok) {
    switch (loaded.reason) {
      case "not_found":
        return apiError("Book not found", "NOT_FOUND", 404);
      case "unauthorized":
        return apiError("Authentication required", "UNAUTHORIZED", 401);
      case "forbidden":
        return apiError("Access denied", "FORBIDDEN", 403);
      case "server_error":
        return apiError("Failed to fetch chapters", "SERVER_ERROR", 500);
    }
  }

  const { book, chapters, authorName } = loaded.source;

  // EPUB에는 응답을 싣지 않습니다. 워크북을 채워 보는 형식은 PDF이고
  // (M5 게이트), EPUB은 지금까지처럼 빈 워크시트로 나갑니다.
  let epubBuffer: Buffer;
  try {
    epubBuffer = await generateEpub(book, chapters, authorName);
  } catch (err) {
    const message = err instanceof Error ? err.message : "EPUB generation failed";
    return apiError(`EPUB generation failed: ${message}`, "SERVER_ERROR", 500);
  }

  const filename = exportFilename(book.title, "epub");

  // Slice to get a clean ArrayBuffer (valid BodyInit in all environments)
  const arrayBuffer = epubBuffer.buffer.slice(
    epubBuffer.byteOffset,
    epubBuffer.byteOffset + epubBuffer.byteLength,
  );

  return new Response(arrayBuffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": epubBuffer.byteLength.toString(),
      "Cache-Control": "no-store",
    },
  });
}
