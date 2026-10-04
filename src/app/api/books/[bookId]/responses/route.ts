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
import type { LoadedResponse } from "@/lib/workbook/response-client";
import { scaleRange } from "@/lib/workbook/block-config";
import { isUuid } from "@/lib/template-node-id";
import { readAllRows } from "@/lib/supabase/read-all";

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
  if (!isUuid(bookId)) {
    return apiError("책 주소가 올바르지 않아요.", "VALIDATION_ERROR", 400);
  }

  const supabase = await createClient();

  // 범위 없이 읽으면 1000건에서 잘려, 긴 워크북을 새 기기에서 열 때 뒤쪽
  // 답이 비어 보였습니다(코드 리뷰 3-P1-3).
  const { data: rows, error } = await readAllRows<ResponseRowFromDb>((from, to) =>
    supabase
      .from("workbook_responses")
      .select("block_id, field_key, value_text, value_number, value_bool, updated_at, written_at")
      .eq("book_id", bookId)
      .order("id")
      .range(from, to),
  );

  if (error) {
    console.error("[responses] load failed", error);
    return apiError("저장된 답을 불러오지 못했어요.", "SERVER_ERROR", 500);
  }

  return apiSuccess(rows.map(toLoadedResponse));
}

type ResponseRowFromDb = {
  block_id: string;
  field_key: string;
  value_text: string | null;
  value_number: number | string | null;
  value_bool: boolean | null;
  updated_at: string;
  written_at: string | null;
};

/**
 * `value_number`는 NUMERIC 컬럼이라 드라이버·직렬화 경로에 따라 문자열로
 * 올 수 있습니다. 리더는 `typeof value === "number"`로 판정하므로, 문자열이
 * 그대로 흘러가면 스케일 응답이 조용히 미응답으로 보입니다.
 */
function toLoadedResponse(row: ResponseRowFromDb): LoadedResponse {
  const parsed =
    row.value_number === null ? null : Number(row.value_number);

  return {
    block_id: row.block_id,
    field_key: row.field_key,
    value_text: row.value_text,
    value_number: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    value_bool: row.value_bool,
    updated_at: row.updated_at,
    written_at: row.written_at,
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
  if (!isUuid(bookId)) {
    return apiError("책 주소가 올바르지 않아요.", "VALIDATION_ERROR", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  // 400은 본문이 깨졌을 때만입니다. 항목 하나가 잘못된 것은 `rejected`로
  // 돌려주고 나머지를 저장합니다(parseResponseWrites 참고).
  const parsed = parseResponseWrites(body);
  if (!parsed.ok) return apiError(parsed.error, "VALIDATION_ERROR", 400);
  if (parsed.writes.length === 0) {
    return apiSuccess({ saved: 0, rejected: parsed.rejected });
  }

  // 응답을 쓸 수 있는지는 책 접근 권한이 정합니다. RLS의
  // workbook_responses_insert_own도 같은 판정을 하지만, 여기서 먼저 보면
  // "저장은 조용히 안 됐는데 화면은 저장됨"이 되지 않습니다.
  const access = await checkBookAccess(user.id, bookId);
  // 판정 실패는 500이어야 리더가 답을 큐에 남겨 다음 저장 때 다시 보냅니다.
  if (access.reason === "unavailable") {
    return apiError("접근 권한을 확인하지 못했어요. 잠시 뒤 다시 저장할게요.", "SERVER_ERROR", 500);
  }
  if (!access.hasAccess) {
    return apiError("이 책에 답을 저장할 권한이 없어요. 구매했는지 확인해 주세요.", "FORBIDDEN", 403);
  }

  const supabase = await createClient();

  // 블록이 정말 이 책에 속하는지 확인합니다. book_id를 걸지 않으면 남의
  // 책 블록 ID를 실어 보내 이 책의 응답인 것처럼 붙일 수 있습니다.
  const { data: blocks, error: blocksError } = await supabase
    .from("workbook_blocks")
    .select("id, book_id, chapter_id, block_type, config, chapters(status)")
    .eq("book_id", bookId)
    .in("id", writeBlockIds(parsed.writes));

  if (blocksError) {
    console.error("[responses] block lookup failed", blocksError);
    return apiError("문항을 확인하지 못했어요. 잠시 뒤 다시 저장할게요.", "SERVER_ERROR", 500);
  }

  // 공개 전(draft) 장의 블록에는 답을 받지 않습니다(코드 리뷰 3-P1-8).
  // 독자는 그 장의 본문을 볼 수 없으니 답할 곳도 없어야 합니다. 소유자는
  // 미리보기에서 draft 장을 확인하므로 받습니다. RLS(00008)도 같은
  // 기준으로 블록을 숨기고 쓰기를 막습니다.
  const answerable = ((blocks ?? []) as BlockRow[]).filter(
    (block) =>
      access.reason === "owner" || chapterStatus(block) === "published",
  );

  // 조회가 실패했는데 정의 0개로 넘어가면 모든 답이 `rejected`로 담긴
  // 200이 됩니다. 리더는 그것을 "보냈다"로 보고 큐에서 지우므로 답이
  // 다시 전송되지 않습니다. 500이면 큐에 남아 다음 저장 때 다시 갑니다.
  const loaded = await loadFieldDefinitions(supabase, answerable);
  if (!loaded.ok) return apiError(loaded.error, "SERVER_ERROR", 500);

  const { rows, rejected } = buildResponseRows(
    user.id,
    parsed.writes,
    loaded.definitions,
  );

  rejected.unshift(...parsed.rejected);

  if (rows.length > 0) {
    const { error } = await supabase
      .from("workbook_responses")
      // 충돌 키에 book_id가 없습니다. 동기화가 블록을 다른 책으로 옮기지
      // 않으므로(00007) 에디터 경로로는 블록 ID 하나가 한 책에만 속합니다.
      // 단, 지운 블록의 ID를 업로드·직접 편집으로 다른 책에 다시 넣으면
      // 옛 책의 답 행을 덮을 수 있습니다(WP4 결과의 "범위 밖").
      .upsert(rows, { onConflict: "user_id,block_id,field_key" });

    if (error) {
      console.error("[responses] upsert failed", error);
      return apiError("답을 저장하지 못했어요. 잠시 뒤 다시 저장할게요.", "SERVER_ERROR", 500);
    }
  }

  return apiSuccess({ saved: rows.length, rejected });
}

type BlockRow = {
  id: string;
  book_id: string;
  chapter_id: string;
  block_type: string;
  config: Record<string, unknown> | null;
  /** to-one 임베드. 클라이언트 버전에 따라 객체 또는 배열로 옵니다. */
  chapters: { status: string } | { status: string }[] | null;
};

function chapterStatus(block: BlockRow): string | null {
  const chapter = Array.isArray(block.chapters) ? block.chapters[0] : block.chapters;
  return chapter?.status ?? null;
}

async function loadFieldDefinitions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  blocks: readonly BlockRow[],
): Promise<
  | { ok: true; definitions: StoredFieldDefinition[] }
  | { ok: false; error: string }
> {
  if (blocks.length === 0) return { ok: true, definitions: [] };

  const { data: fields, error } = await supabase
    .from("workbook_block_fields")
    .select("block_id, field_key, input_type")
    .in(
      "block_id",
      blocks.map((block) => block.id),
    );

  if (error) {
    console.error("[responses] field lookup failed", error);
    return { ok: false, error: "문항을 확인하지 못했어요. 잠시 뒤 다시 저장할게요." };
  }

  const blockById = new Map(blocks.map((block) => [block.id, block]));

  const definitions = (fields ?? []).flatMap((field) => {
    const block = blockById.get(field.block_id);
    if (!block) return [];
    return [
      {
        block_id: field.block_id,
        field_key: field.field_key,
        input_type: field.input_type,
        chapter_id: block.chapter_id,
        book_id: block.book_id,
        // 척도는 정수이면서 지금 범위 안이어야 합니다(코드 리뷰 3-P1-1).
        // 범위 해석은 리더·에디터와 같은 함수입니다.
        range:
          block.block_type === "scale"
            ? scaleRange(block.config?.min, block.config?.max)
            : undefined,
      },
    ];
  });
  return { ok: true, definitions };
}
