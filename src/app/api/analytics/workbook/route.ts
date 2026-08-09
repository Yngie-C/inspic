import { NextRequest } from "next/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { createClient } from "@/lib/supabase/server";
import {
  buildEngagement,
  type BlockDefinition,
  type ResponseStatRow,
} from "@/lib/workbook/engagement";

/**
 * 책 한 권의 워크북 참여 지표. 소유자만 볼 수 있습니다.
 *
 * 응답 원문은 여기서 나오지 않습니다. `workbook_response_stats()`가
 * 세는 값만 돌려주고, 그 함수는 소유자만 실행할 수 있습니다. 소유 확인을
 * 라우트에서 한 번 더 하는 이유는 함수가 던지는 권한 예외를 500이 아니라
 * 403으로 돌려주기 위해서입니다.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  const bookId = new URL(request.url).searchParams.get("bookId");
  if (!bookId) {
    return apiError("bookId query parameter is required", "VALIDATION_ERROR", 400);
  }

  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, owner_id")
    .eq("id", bookId)
    .maybeSingle();

  if (!book) return apiError("Book not found", "NOT_FOUND", 404);
  if (book.owner_id !== user.id) {
    return apiError("Access denied", "FORBIDDEN", 403);
  }

  const [{ data: stats, error: statsError }, { data: chapters }, { data: blocks }] =
    await Promise.all([
      supabase.rpc("workbook_response_stats", { p_book_id: bookId }),
      supabase
        .from("chapters")
        .select("id, title, order_index")
        .eq("book_id", bookId),
      supabase
        .from("workbook_blocks")
        .select(
          "id, chapter_id, block_type, order_index, workbook_block_fields(field_key, label, order_index)",
        )
        .eq("book_id", bookId),
    ]);

  if (statsError) {
    return apiError("Failed to fetch response stats", "SERVER_ERROR", 500);
  }

  const definitions: BlockDefinition[] = (blocks ?? []).map((block) => ({
    id: block.id,
    chapter_id: block.chapter_id,
    block_type: block.block_type,
    order_index: block.order_index,
    fields: block.workbook_block_fields ?? [],
  }));

  return apiSuccess(
    buildEngagement(
      chapters ?? [],
      definitions,
      (stats ?? []) as ResponseStatRow[],
    ),
  );
}
