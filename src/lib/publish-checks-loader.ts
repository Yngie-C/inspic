import type { createClient } from "./supabase/server";
import { readAllRows } from "./supabase/read-all";
import {
  runPublishChecks,
  type PublishCheck,
  type PublishCheckChapter,
  type StoredBlock,
} from "./publish-checks";

/**
 * 공개 전 검수에 필요한 데이터를 모아 검사를 돌립니다.
 *
 * 판정 로직은 `publish-checks.ts`에 순수 함수로 두고, DB 접근만 여기에
 * 둡니다. 화면(미리보기·편집 배너)과 API(책 공개, 장 공개 전환)가 같은
 * 결과를 봐야 하는데 로직이 나뉘면 "미리보기에서는 통과했는데 출간은
 * 막히는" 상태가 됩니다.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type PublishChecksResult =
  | { ok: true; checks: PublishCheck[] }
  | { ok: false; reason: "not-found" | "error" };

export interface PublishChecksOptions {
  /**
   * 이 장의 상태가 바뀌었다고 가정하고 검사합니다. 장 하나를 공개하거나
   * 내리기 전에, 바뀐 뒤의 책이 통과하는지 봅니다.
   */
  assumeChapterStatus?: { id: string; status: PublishCheckChapter["status"] };
}

export async function loadPublishChecks(
  supabase: ServerClient,
  bookId: string,
  options: PublishChecksOptions = {},
): Promise<PublishChecksResult> {
  // 조회 에러를 "없음"으로 삼키면 DB 장애가 거짓 차단(장 없음, 블록 미저장)
  // 이나 404로 보입니다(4-P1-25). 호출자는 `error`를 500으로 냅니다.
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("title, description, cover_image_url, price")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) {
    console.error("[publish-checks] 책을 읽지 못했습니다", { bookId, bookError });
    return { ok: false, reason: "error" };
  }
  if (!book) return { ok: false, reason: "not-found" };

  const [chaptersResult, storedBlocks] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, title, content_html, status, order_index")
      .eq("book_id", bookId)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    loadStoredBlocks(supabase, bookId),
  ]);

  if (chaptersResult.error || !storedBlocks) {
    console.error("[publish-checks] 장·블록을 읽지 못했습니다", {
      bookId,
      error: chaptersResult.error,
    });
    return { ok: false, reason: "error" };
  }

  const assumed = options.assumeChapterStatus;
  const chapters = ((chaptersResult.data ?? []) as PublishCheckChapter[]).map(
    (chapter) =>
      assumed && chapter.id === assumed.id
        ? { ...chapter, status: assumed.status }
        : chapter,
  );

  return {
    ok: true,
    checks: runPublishChecks({ book, chapters, storedBlocks }),
  };
}

/**
 * 이 책의 저장된 블록 정의와 문항 전부. 읽지 못하면 null.
 *
 * 정렬 없이 받으면 임의의 1000개만 와서, 동기화가 끝난 장이 호출마다 다르게
 * "저장되지 않음"으로 막혔습니다(4-P1-26). 정렬된 범위로 끝까지 읽습니다.
 */
async function loadStoredBlocks(
  supabase: ServerClient,
  bookId: string,
): Promise<StoredBlock[] | null> {
  // 문항은 블록 아래에 묻어 옵니다(`max_rows`는 바깥 행에 걸립니다).
  const { data, error } = await readAllRows<{
    id: string;
    chapter_id: string;
    workbook_block_fields: StoredBlock["fields"] | null;
  }>((from, to) =>
    supabase
      .from("workbook_blocks")
      .select("id, chapter_id, workbook_block_fields(field_key, input_type)")
      .eq("book_id", bookId)
      .order("id", { ascending: true })
      .range(from, to),
  );

  if (error) {
    console.error("[publish-checks] 블록을 읽지 못했습니다", { bookId, error });
    return null;
  }

  return data.map((row) => ({
    id: row.id,
    chapter_id: row.chapter_id,
    fields: row.workbook_block_fields ?? [],
  }));
}
