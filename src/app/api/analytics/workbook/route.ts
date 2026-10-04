import { NextRequest } from "next/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all";
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

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, owner_id")
    .eq("id", bookId)
    .maybeSingle();

  // 일시 장애를 404로 내면 저자에게는 책이 지워진 것처럼 보입니다(7-P2-2).
  if (bookError) {
    console.error("[analytics/workbook] 책을 읽지 못했습니다", bookError.message);
    return apiError("참여 지표를 불러오지 못했어요.", "SERVER_ERROR", 500);
  }
  if (!book) return apiError("Book not found", "NOT_FOUND", 404);
  if (book.owner_id !== user.id) {
    return apiError("Access denied", "FORBIDDEN", 403);
  }

  // 셋 중 하나라도 빠지면 "아무도 답하지 않음"·"블록 없음"이 실제 결과처럼
  // 보입니다(7-P1-3). 블록과 집계 행은 1000건에서 잘리지 않게 끝까지
  // 읽습니다(7-P1-4) — 잘리면 답한 문항이 0으로 나와 거짓 이탈 지점이 됩니다.
  const [stats, chapters, blocks] = await Promise.all([
    readAllRows<ResponseStatRow>((from, to) =>
      supabase
        .rpc("workbook_response_stats", { p_book_id: bookId })
        // 집계 행은 (chapter_id, block_id, field_key)마다 하나입니다.
        .order("block_id")
        .order("field_key")
        .order("chapter_id")
        .range(from, to),
    ),
    supabase
      .from("chapters")
      .select("id, title, order_index")
      .eq("book_id", bookId),
    readAllRows<BlockRow>((from, to) =>
      supabase
        .from("workbook_blocks")
        .select(
          "id, chapter_id, block_type, order_index, workbook_block_fields(field_key, label, order_index)",
        )
        .eq("book_id", bookId)
        .order("id")
        .range(from, to),
    ),
  ]);

  const failed = stats.error ?? chapters.error ?? blocks.error;
  if (failed || !stats.data || !blocks.data) {
    console.error("[analytics/workbook] 지표를 읽지 못했습니다", failed?.message);
    return apiError("참여 지표를 불러오지 못했어요.", "SERVER_ERROR", 500);
  }

  const definitions: BlockDefinition[] = blocks.data.map((block) => ({
    id: block.id,
    chapter_id: block.chapter_id,
    block_type: block.block_type,
    order_index: block.order_index,
    fields: block.workbook_block_fields ?? [],
  }));

  return apiSuccess(
    buildEngagement(chapters.data ?? [], definitions, stats.data),
  );
}

type BlockRow = Omit<BlockDefinition, "fields"> & {
  workbook_block_fields: BlockDefinition["fields"] | null;
};
