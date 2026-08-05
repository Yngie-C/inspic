import type { createClient } from "./supabase/server";
import {
  runPublishChecks,
  type PublishCheck,
  type PublishCheckChapter,
} from "./publish-checks";

/**
 * 공개 전 검수에 필요한 데이터를 모아 검사를 돌립니다.
 *
 * 판정 로직은 `publish-checks.ts`에 순수 함수로 두고, DB 접근만 여기에
 * 둡니다. 두 곳(미리보기 화면, 출간 API)이 같은 결과를 봐야 하는데
 * 로직이 나뉘면 "미리보기에서는 통과했는데 출간은 막히는" 상태가 됩니다.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type PublishChecksResult =
  | { ok: true; checks: PublishCheck[] }
  | { ok: false; reason: "not-found" };

export async function loadPublishChecks(
  supabase: ServerClient,
  bookId: string,
): Promise<PublishChecksResult> {
  const { data: book } = await supabase
    .from("books")
    .select("title, description, cover_image_url")
    .eq("id", bookId)
    .single();

  if (!book) return { ok: false, reason: "not-found" };

  const [{ data: chapters }, { data: blocks }] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, title, content_html, status, order_index")
      .eq("book_id", bookId)
      .order("order_index", { ascending: true }),
    supabase.from("workbook_blocks").select("id").eq("book_id", bookId),
  ]);

  return {
    ok: true,
    checks: runPublishChecks({
      book,
      chapters: (chapters ?? []) as PublishCheckChapter[],
      storedBlockIds: (blocks ?? []).map((block) => block.id as string),
    }),
  };
}
