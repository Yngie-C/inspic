import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all";
import { summarizeProgress } from "@/lib/workbook/responses";
import type { WorkbookResponse } from "@/lib/workbook/types";

/**
 * 내가 워크북에 답을 쓴 책 목록.
 *
 * "구매한 책"(`/api/purchases`)과 다릅니다. 무료로 읽으며 답만 쓴 책도
 * 여기 나오고, 샀지만 아직 아무것도 안 쓴 책은 나오지 않습니다. 독자가
 * 다시 찾는 것은 산 목록이 아니라 자기가 쓴 것입니다.
 *
 * 응답은 RLS가 본인 것만 보여 주므로 user_id를 따로 걸지 않습니다.
 */

interface WorkbookSummary {
  book_id: string;
  title: string;
  cover_image_url: string | null;
  author_name: string | null;
  total_fields: number;
  answered_fields: number;
  last_written_at: string;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const supabase = await createClient();

  // 답이 1000건을 넘는 독자는 범위 없이 읽으면 책이 목록에서 빠지거나
  // 진행률이 낮게 나옵니다(코드 리뷰 7-P1-5).
  const { data: responses, error: responsesError } = await readAllRows<ResponseRow>(
    (from, to) =>
      supabase
        .from("workbook_responses")
        .select(
          "book_id, block_id, field_key, value_text, value_number, value_bool, updated_at, written_at",
        )
        .order("id")
        .range(from, to),
  );

  if (responsesError) {
    console.error("[my/workbooks] 응답을 읽지 못했습니다", responsesError.message);
    return apiError("Failed to fetch responses", "SERVER_ERROR", 500);
  }

  const bookIds = [...new Set(responses.map((row) => row.book_id))];
  if (bookIds.length === 0) return apiSuccess([]);

  // 내려간 책(비공개 전환·미발행)은 RLS가 걸러서 여기 안 옵니다. 응답은
  // 남아 있지만 읽을 수 없는 책이라 목록에 띄우지 않습니다.
  //
  // 조회가 실패한 것과 책이 없는 것은 다릅니다. 실패를 빈 목록으로 내면
  // "쓴 워크북 없음"이 뜨고 화면의 재시도가 동작하지 않습니다(7-P1-6).
  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, title, cover_image_url, owner_id")
    .in("id", bookIds);

  if (booksError) {
    console.error("[my/workbooks] 책을 읽지 못했습니다", booksError.message);
    return apiError("Failed to fetch books", "SERVER_ERROR", 500);
  }
  if (!books || books.length === 0) return apiSuccess([]);

  const visibleIds = books.map((book) => book.id);

  const [blocks, { data: profiles, error: profilesError }] = await Promise.all([
    readAllRows<{
      id: string;
      book_id: string;
      workbook_block_fields: { field_key: string }[] | null;
    }>((from, to) =>
      supabase
        .from("workbook_blocks")
        .select("id, book_id, workbook_block_fields(field_key)")
        .in("book_id", visibleIds)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("user_profiles")
      .select("user_id, display_name")
      .in("user_id", [...new Set(books.map((book) => book.owner_id))]),
  ]);

  // 블록이 빠지면 진행률의 분모가 0이나 실제보다 작게 나옵니다.
  if (blocks.error) {
    console.error("[my/workbooks] 블록을 읽지 못했습니다", blocks.error.message);
    return apiError("Failed to fetch workbook blocks", "SERVER_ERROR", 500);
  }

  // 저자 이름은 없어도 목록은 그려집니다. 막지 않고 남기기만 합니다.
  if (profilesError) {
    console.error("[my/workbooks] 저자 이름을 읽지 못했습니다", profilesError.message);
  }

  const authorByUserId = new Map(
    (profiles ?? []).map((row) => [row.user_id, row.display_name]),
  );

  // book_id → 지금 책에 있는 문항 전부.
  const fieldsByBook = new Map<string, { block_id: string; field_key: string }[]>();
  for (const block of blocks.data) {
    const list = fieldsByBook.get(block.book_id) ?? [];
    for (const field of block.workbook_block_fields ?? []) {
      list.push({ block_id: block.id, field_key: field.field_key });
    }
    fieldsByBook.set(block.book_id, list);
  }

  const summaries: WorkbookSummary[] = books.map((book) => {
    const mine = responses.filter((row) => row.book_id === book.id);

    return {
      book_id: book.id,
      title: book.title,
      cover_image_url: book.cover_image_url,
      author_name: authorByUserId.get(book.owner_id) ?? null,
      ...summarizeProgress(fieldsByBook.get(book.id) ?? [], mine.map(toResponse)),
      last_written_at: mine.reduce((latest, row) => {
        const at = writtenAt(row);
        return at > latest ? at : latest;
      }, ""),
    };
  });

  // 최근에 쓴 것이 위로. 이어서 쓰려고 오는 화면입니다.
  summaries.sort((a, b) => b.last_written_at.localeCompare(a.last_written_at));

  return apiSuccess(summaries);
}

type ResponseRow = {
  book_id: string;
  block_id: string;
  field_key: string;
  value_text: string | null;
  value_number: number | string | null;
  value_bool: boolean | null;
  updated_at: string;
  written_at: string | null;
};

/**
 * 독자가 그 답을 쓴 시각. `updated_at`은 장 삭제·블록 이동(repoint)으로도
 * 올라서 몇 달 전에 쓴 책이 맨 위로 올라옵니다(7-P2-4). `written_at`이
 * 없는 예전 행(00008 이전)만 `updated_at`으로 대신합니다.
 */
function writtenAt(row: ResponseRow): string {
  return row.written_at ?? row.updated_at;
}

function toResponse(row: ResponseRow): WorkbookResponse {
  const parsed = row.value_number === null ? null : Number(row.value_number);

  return {
    block_id: row.block_id,
    field_key: row.field_key,
    value_text: row.value_text,
    value_number: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    value_bool: row.value_bool,
  };
}
