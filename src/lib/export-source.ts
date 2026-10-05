import { createClient } from "@/lib/supabase/server";
import { checkBookAccess } from "@/lib/access-control";
import type { Book, Chapter } from "@/types";

/**
 * 내보내기(PDF·EPUB)가 쓰는 원본 로더.
 *
 * 두 라우트가 같은 것을 각자 읽고 있었고, 권한 판정도 각자 하고 있었습니다.
 * 그 판정(`visibility === "public" && status === "published"`)은 구매를 보지
 * 않아서, 유료 책을 산 사람과 사지 않은 사람을 구분하지 못했습니다.
 * 실제 유출은 RLS가 막고 있었지만(세션 클라이언트로 챕터를 읽으므로
 * 미구매자에게는 미리보기 한 챕터만 옵니다), 라우트 자신의 판정은 틀린
 * 채였습니다. 이제 화면·리더와 같은 `checkBookAccess()`를 씁니다.
 */

export interface ExportSource {
  book: Book;
  chapters: Chapter[];
  authorName: string;
}

export type ExportSourceFailure =
  | "not_found"
  /** 로그인하면 볼 수 있을지도 모릅니다. */
  | "unauthorized"
  /** 로그인해도 볼 수 없습니다. */
  | "forbidden"
  | "server_error";

export type LoadExportSourceResult =
  | { ok: true; source: ExportSource }
  | { ok: false; reason: ExportSourceFailure };

const UNKNOWN_AUTHOR = "이름 없는 저자";

export async function loadExportSource(
  bookId: string,
  userId: string | null,
): Promise<LoadExportSourceResult> {
  const supabase = await createClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) return { ok: false, reason: "server_error" };
  if (!book) return { ok: false, reason: "not_found" };

  const access = await checkBookAccess(userId, bookId);
  if (access.reason === "unavailable") return { ok: false, reason: "server_error" };

  // 미리보기(첫 챕터만 열린 상태)로는 내보내지 않습니다. 한 챕터짜리
  // PDF를 책이라고 내려 주면 산 것과 구분이 안 됩니다.
  if (!access.hasAccess) {
    return { ok: false, reason: userId ? "forbidden" : "unauthorized" };
  }

  const { data: chapters, error: chaptersError } = await supabase
    .from("chapters")
    .select("*")
    .eq("book_id", bookId)
    .eq("status", "published")
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (chaptersError) return { ok: false, reason: "server_error" };

  // 표시 이름은 없을 수 있습니다. 없다고 내보내기를 막지는 않습니다.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("user_id", book.owner_id)
    .maybeSingle();

  return {
    ok: true,
    source: {
      book: book as Book,
      chapters: (chapters ?? []) as Chapter[],
      authorName: profile?.display_name || UNKNOWN_AUTHOR,
    },
  };
}

/** 내려받는 파일 이름. 한글 제목을 살립니다. */
export function exportFilename(title: string, extension: string): string {
  const safe = title
    .replace(/[^a-zA-Z0-9가-힣\s\-_]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);

  return `${safe || "book"}.${extension}`;
}

/**
 * 내려받기 `Content-Disposition` 헤더.
 *
 * 헤더 값에는 코드 255를 넘는 문자가 들어갈 수 없어서, 한글 이름을
 * `filename="..."`에 그대로 넣으면 `new Response()`가 던지고 한글 제목
 * 책은 전부 500이 됐습니다. 한글 이름은 `filename*`(RFC 5987)로 싣고,
 * 따옴표 쪽에는 그것을 읽지 못하는 클라이언트를 위한 ASCII 이름만 둡니다.
 */
export function exportContentDisposition(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const extension = dot >= 0 ? filename.slice(dot + 1) : "";
  const asciiBase = (dot >= 0 ? filename.slice(0, dot) : filename)
    .replace(/[^a-zA-Z0-9\-_]/g, "")
    .replace(/^[_-]+|[_-]+$/g, "");
  const ascii = `${asciiBase || "book"}${extension ? `.${extension}` : ""}`;

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
