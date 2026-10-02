import { createClient } from "@/lib/supabase/server";

/**
 * 책 한 권에 대한 접근 판정.
 *
 * 화면과 API가 모두 이 함수 하나를 씁니다. 실제 차단은 RLS가 하고
 * (`has_book_access` / `chapters_select*`), 여기서 나오는 값은 무엇을
 * 어떻게 보여 줄지를 정합니다. 판정이 두 벌이 되면 "화면은 열렸는데
 * 내용은 안 오는" 상태가 생깁니다.
 */

export type AccessReason =
  /** 내 책. 미발행·비공개도 봅니다. */
  | "owner"
  /** 구매했습니다. */
  | "purchased"
  /** 무료 공개 발행본. 로그인하지 않아도 봅니다. */
  | "free"
  /** 유료 책이지만 첫 챕터는 열려 있습니다. */
  | "preview"
  /** 아무것도 볼 수 없습니다. */
  | "none"
  /**
   * 판정하지 못했습니다(조회 실패). 아무것도 열지 않지만 "권한 없음"과
   * 다릅니다 — 호출자는 5xx로 다루세요. 403이나 결제 유도로 보이면
   * 이미 산 독자가 다시 결제하거나, 리더가 보낸 답을 큐에서 버립니다.
   */
  | "unavailable";

export interface BookAccessResult {
  /**
   * 책 **전체**를 읽을 수 있는가.
   *
   * 미리보기는 false입니다. 여기가 true여야 워크북 응답도 저장됩니다.
   */
  hasAccess: boolean;
  reason: AccessReason;
  /**
   * 일부라도 읽을 것이 있는가. `hasAccess || reason === "preview"`.
   *
   * 리더가 "구매 안내를 띄울지, 본문을 그릴지"를 이것으로 정합니다.
   */
  canRead: boolean;
  /**
   * 워크북 응답을 서버에 저장할 수 있는가.
   *
   * 접근 권한만으로는 부족합니다 — 응답은 계정에 매달리므로 로그인이
   * 함께 필요합니다. 무료 책을 비로그인으로 읽는 경우가 여기서
   * 갈리고, 리더는 그때 "이 기기에만 저장됨"을 띄웁니다.
   */
  canSaveResponses: boolean;
}

function result(
  reason: AccessReason,
  userId: string | null,
): BookAccessResult {
  const hasAccess =
    reason === "owner" || reason === "purchased" || reason === "free";
  return {
    hasAccess,
    reason,
    canRead: hasAccess || reason === "preview",
    canSaveResponses: hasAccess && userId !== null,
  };
}

export async function checkBookAccess(
  userId: string | null,
  bookId: string,
): Promise<BookAccessResult> {
  const supabase = await createClient();

  // 남의 비공개 책은 RLS가 행을 숨기므로 "없는 책"과 같게 보입니다.
  // 구매자에게는 books_select_purchased가 내려간 책도 보여 줍니다(00006).
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("owner_id, price, status, visibility")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) return result("unavailable", userId);
  if (!book) return result("none", userId);

  // 판정 순서는 SQL has_book_access와 같습니다(마이그레이션 00006):
  // 소유자 → 완료된 구매 → 공개 발행본. 구매를 공개 상태보다 먼저 봐야
  // 저자가 책을 내려도 산 독자가 계속 읽습니다.
  if (userId && book.owner_id === userId) return result("owner", userId);

  if (userId) {
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .eq("status", "completed")
      .maybeSingle();

    if (purchaseError) return result("unavailable", userId);
    if (purchase) return result("purchased", userId);
  }

  // 비공개·미발행 책은 소유자와 구매자만. 미리보기도 열리지 않습니다.
  if (book.status !== "published" || book.visibility !== "public") {
    return result("none", userId);
  }

  if (book.price === 0) return result("free", userId);

  // 유료 책의 첫 챕터는 누구에게나 열려 있습니다 (마이그레이션 00003의
  // chapters_select_preview). 열어 줄 챕터가 실제로 있는지는 RLS가
  // 정하므로 여기서 다시 세지 않습니다 — 없으면 리더가 받는 챕터
  // 목록이 비고, 그 화면이 이미 준비돼 있습니다.
  return result("preview", userId);
}
