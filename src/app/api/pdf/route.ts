import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all";
import { getAuthUser, apiError } from "@/lib/api-utils";
import { renderBookPdf } from "@/lib/pdf-generator";
import {
  exportContentDisposition,
  exportFilename,
  loadExportSource,
} from "@/lib/export-source";
import { isUuid } from "@/lib/template-node-id";
import { splitAnswers, type StoredResponseRow } from "@/lib/workbook/export-answers";

/**
 * 책 한 권을 PDF로. 내가 쓴 워크북 답이 제자리에 채워진 채로 나옵니다.
 *
 * 답을 세션 클라이언트로 읽는 것이 곧 소유 확인입니다 —
 * `workbook_responses`는 RLS상 작성자 본인에게만 보입니다. 남의 답이
 * 섞여 나올 경로가 없습니다.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get("bookId");

  if (!bookId) {
    return apiError("bookId query parameter is required", "VALIDATION_ERROR", 400);
  }
  // 형식이 틀린 ID를 DB에 넘기면 uuid 형변환 오류(22P02)가 500으로 나갑니다.
  if (!isUuid(bookId)) {
    return apiError("책 주소가 올바르지 않아요.", "VALIDATION_ERROR", 400);
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
  const responses = await loadResponses(bookId, user?.id);
  if (!responses) {
    return apiError("저장된 답을 불러오지 못했어요.", "SERVER_ERROR", 500);
  }
  const { answers, orphans } = splitAnswers(chapters, responses);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderBookPdf({ book, chapters, authorName, answers, orphans });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF generation failed";
    return apiError(`PDF generation failed: ${message}`, "SERVER_ERROR", 500);
  }

  const filename = exportFilename(book.title, "pdf");

  const arrayBuffer = pdfBuffer.buffer.slice(
    pdfBuffer.byteOffset,
    pdfBuffer.byteOffset + pdfBuffer.byteLength,
  );

  return new Response(arrayBuffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": exportContentDisposition(filename),
      "Content-Length": pdfBuffer.byteLength.toString(),
      "Cache-Control": "no-store",
    },
  });
}

/**
 * 비로그인으로 무료 책을 받는 경우가 있습니다. 그때는 계정에 남은 답이
 * 없으므로 빈 워크시트가 나옵니다.
 *
 * 조회가 실패하면 `null`입니다. 빈 목록으로 넘기면 답이 전부 빈칸인
 * PDF가 정상인 것처럼 나갑니다. 범위 없이 읽으면 1000건에서 조용히 잘려
 * 뒤쪽 답이 빈칸으로 나가므로 끝까지 읽습니다.
 */
async function loadResponses(
  bookId: string,
  userId: string | undefined,
): Promise<StoredResponseRow[] | null> {
  if (!userId) return [];

  const supabase = await createClient();
  const { data, error } = await readAllRows<StoredResponseRow>((from, to) =>
    supabase
      .from("workbook_responses")
      .select("chapter_id, block_id, field_key, value_text, value_number, value_bool")
      .eq("book_id", bookId)
      .order("id")
      .range(from, to),
  );

  if (error) {
    console.error("[pdf] responses load failed", error);
    return null;
  }

  return data.map((row) => ({
    ...row,
    // NUMERIC은 드라이버에 따라 문자열로 옵니다. 그대로 두면 척도 답이
    // 조용히 미응답으로 보입니다 (리더가 겪은 것과 같은 문제입니다).
    value_number: row.value_number === null ? null : Number(row.value_number),
  }));
}
