import type { PublishCheck } from "@/lib/publish-checks";

/**
 * 책 공개·내리기 요청 (클라이언트용).
 *
 * 편집 화면 헤더, 책 상세, 미리보기 검수 패널이 모두 이것을 씁니다. 세
 * 곳이 따로 요청을 만들면 한쪽만 visibility를 빠뜨려 "공개했는데 아무도
 * 못 보는" 책이 생깁니다. 차단 판정은 서버(`PUT /api/books/[id]`의
 * `loadPublishChecks()`)가 하고, 여기서는 그 결과를 화면이 쓰기 좋게 풉니다.
 */

export type PublishResult =
  | { ok: true }
  | { ok: false; kind: "blocked"; blockers: PublishCheck[] }
  | { ok: false; kind: "error"; message: string };

export const PUBLISH_CONFIRM_MESSAGE = "이 책을 공개할까요? 공개한 뒤에도 고칠 수 있어요.";

const PUBLISH_FAILED = "공개하지 못했어요. 잠시 뒤 다시 시도해 주세요.";

function isPublishCheck(value: unknown): value is PublishCheck {
  if (!value || typeof value !== "object") return false;
  const check = value as Record<string, unknown>;
  return (
    typeof check.id === "string" &&
    typeof check.title === "string" &&
    typeof check.detail === "string"
  );
}

/** 책 PUT 응답을 공개 결과로 풉니다. 서버 원문은 차단 사유 목록만 씁니다. */
export function interpretPublishResponse(status: number, body: unknown): PublishResult {
  if (status >= 200 && status < 300) return { ok: true };

  const json = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (status === 422 && json.code === "PUBLISH_BLOCKED") {
    const list = Array.isArray(json.blockers) ? json.blockers.filter(isPublishCheck) : [];
    // 사유 없이 막혔다고만 하면 고칠 곳을 알 수 없습니다. 미리보기의
    // 검수 패널은 판정을 다시 불러오므로 그쪽으로 안내합니다.
    if (list.length === 0) {
      return {
        ok: false,
        kind: "error",
        message: "공개하려면 고쳐야 할 곳이 있어요. 미리보기에서 확인해 주세요.",
      };
    }
    return { ok: false, kind: "blocked", blockers: list };
  }

  return { ok: false, kind: "error", message: PUBLISH_FAILED };
}

export async function publishBook(bookId: string): Promise<PublishResult> {
  let res: Response;
  try {
    res = await fetch(`/api/books/${bookId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // visibility를 함께 보냅니다. 서버는 draft → published일 때만 public을
      // 채우므로, published + private으로 남은 책은 status만으로 열리지 않습니다.
      body: JSON.stringify({ status: "published", visibility: "public" }),
    });
  } catch {
    return { ok: false, kind: "error", message: PUBLISH_FAILED };
  }
  const body = await res.json().catch(() => null);
  return interpretPublishResponse(res.status, body);
}

/** 내리면 새 독자에게 보이지 않습니다. 이미 산 독자는 계속 읽습니다. */
export async function unpublishBook(bookId: string): Promise<void> {
  const res = await fetch(`/api/books/${bookId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "draft", visibility: "private" }),
  });
  if (!res.ok) throw new Error("상태를 바꾸지 못했어요.");
}
