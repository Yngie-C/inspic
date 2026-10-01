import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser, apiError, apiSuccess } from "@/lib/api-utils";
import { checkBookAccess } from "@/lib/access-control";
import {
  buildResponseRows,
  parseResponseWrites,
  writeBlockIds,
  type StoredFieldDefinition,
} from "@/lib/workbook/response-payload";
import type { WorkbookResponse } from "@/lib/workbook/types";

/**
 * 독자 응답의 읽기·쓰기 경로.
 *
 * 저작 측 정의가 `sync_chapter_workbook_blocks` 하나로 들어가듯, 독자 측
 * 응답은 여기 하나로만 들어갑니다. 리더가 Supabase를 직접 호출하지 않는
 * 이유는 `chapter_id`와 값 컬럼을 클라이언트가 정하게 두지 않기
 * 위해서입니다 — 둘 다 DB의 블록 정의에서 읽습니다.
 *
 * RLS가 최종 방어선입니다(`workbook_responses`는 작성자 본인만). 아래
 * 접근 확인은 정책에 걸려 0행이 조용히 처리되는 대신 분명한 상태 코드를
 * 내기 위한 것입니다.
 */

type Params = { params: Promise<{ bookId: string }> };

/** 내가 이 책에 쓴 응답 전체. 리더가 열 때 한 번 부릅니다. */
export async function GET(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { bookId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workbook_responses")
    .select("block_id, field_key, value_text, value_number, value_bool")
    .eq("book_id", bookId);

  if (error) return apiError(error.message, "SERVER_ERROR", 500);

  return apiSuccess((data ?? []).map(toWorkbookResponse));
}

/**
 * `value_number`는 NUMERIC 컬럼이라 드라이버·직렬화 경로에 따라 문자열로
 * 올 수 있습니다. 리더는 `typeof value === "number"`로 판정하므로, 문자열이
 * 그대로 흘러가면 스케일 응답이 조용히 미응답으로 보입니다.
 */
function toWorkbookResponse(row: {
  block_id: string;
  field_key: string;
  value_text: string | null;
  value_number: number | string | null;
  value_bool: boolean | null;
}): WorkbookResponse {
  const parsed =
    row.value_number === null ? null : Number(row.value_number);

  return {
    block_id: row.block_id,
    field_key: row.field_key,
    value_text: row.value_text,
    value_number: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    value_bool: row.value_bool,
  };
}

/**
 * 응답 배치 저장.
 *
 * 전부 아니면 전무가 아닙니다. 정의가 없거나 타입이 어긋난 항목만 빼고
 * 나머지는 저장한 뒤, 빠진 것을 `rejected`로 돌려줍니다. 하나 때문에
 * 배치를 통째로 버리면 같은 화면에서 함께 쓴 멀쩡한 답까지 사라집니다.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return apiError("Authentication required", "UNAUTHORIZED", 401);

  const { bookId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  const parsed = parseResponseWrites(body);
  if (!parsed.ok) return apiError(parsed.error, "VALIDATION_ERROR", 400);
  if (parsed.writes.length === 0) {
    return apiSuccess({ saved: 0, rejected: [] });
  }

  // 응답을 쓸 수 있는지는 책 접근 권한이 정합니다. RLS의
  // workbook_responses_insert_own도 같은 판정을 하지만, 여기서 먼저 보면
  // "저장은 조용히 안 됐는데 화면은 저장됨"이 되지 않습니다.
  const access = await checkBookAccess(user.id, bookId);
  if (!access.hasAccess) {
    return apiError("이 책에 답을 저장할 권한이 없어요. 구매했는지 확인해 주세요.", "FORBIDDEN", 403);
  }

  const supabase = await createClient();

  // 블록이 정말 이 책에 속하는지 확인합니다. book_id를 걸지 않으면 남의
  // 책 블록 ID를 실어 보내 이 책의 응답인 것처럼 붙일 수 있습니다.
  const { data: blocks, error: blocksError } = await supabase
    .from("workbook_blocks")
    .select("id, book_id, chapter_id")
    .eq("book_id", bookId)
    .in("id", writeBlockIds(parsed.writes));

  if (blocksError) return apiError(blocksError.message, "SERVER_ERROR", 500);

  const definitions = await loadFieldDefinitions(supabase, blocks ?? []);
  const { rows, rejected } = buildResponseRows(
    user.id,
    parsed.writes,
    definitions,
  );

  if (rows.length > 0) {
    const { error } = await supabase
      .from("workbook_responses")
      .upsert(rows, { onConflict: "user_id,block_id,field_key" });

    if (error) return apiError(error.message, "SERVER_ERROR", 500);
  }

  return apiSuccess({ saved: rows.length, rejected });
}

type BlockRow = { id: string; book_id: string; chapter_id: string };

async function loadFieldDefinitions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  blocks: readonly BlockRow[],
): Promise<StoredFieldDefinition[]> {
  if (blocks.length === 0) return [];

  const { data: fields } = await supabase
    .from("workbook_block_fields")
    .select("block_id, field_key, input_type")
    .in(
      "block_id",
      blocks.map((block) => block.id),
    );

  const blockById = new Map(blocks.map((block) => [block.id, block]));

  return (fields ?? []).flatMap((field) => {
    const block = blockById.get(field.block_id);
    if (!block) return [];
    return [
      {
        block_id: field.block_id,
        field_key: field.field_key,
        input_type: field.input_type,
        chapter_id: block.chapter_id,
        book_id: block.book_id,
      },
    ];
  });
}
