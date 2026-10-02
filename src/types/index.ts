// ============================================================
// inspic Core Types
// ============================================================

// --- User ---
export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

// --- Book ---
export type BookStatus = "draft" | "processing" | "published" | "archived";
export type BookVisibility = "private" | "unlisted" | "public";
export type SourceType = "text" | "markdown" | "docx";

export interface Book {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  language: string;
  status: BookStatus;
  visibility: BookVisibility;
  source_type: SourceType;
  source_file_url: string | null;
  total_chapters: number;
  total_words: number;
  published_at: string | null;
  price: number;
  is_free: boolean;
  created_at: string;
  updated_at: string;
}

// --- Chapter ---
export type ChapterStatus = "draft" | "published";

export interface Chapter {
  id: string;
  book_id: string;
  title: string;
  slug: string;
  order_index: number;
  content_html: string;
  content_raw: string | null;
  word_count: number;
  estimated_reading_time: number | null;
  status: ChapterStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// 리더 설정(글자 크기·테마)은 M0에서 삭제했습니다. 타입만 남아 있어
// 호출부가 쓰지도 않는 값을 하드코딩해 넘기고 있었으므로 M3에서 함께
// 지웠습니다. 다시 넣는다면 저장 위치(계정 vs 기기)부터 정하세요.

// --- Content Block (리더기용) ---
export interface ContentBlock {
  type: "paragraph" | "heading" | "list" | "blockquote" | "code" | "image" | "html";
  content: string;
  level?: number; // heading level
}

// --- API ---
export interface ApiError {
  error: string;
  code: string;
}

export interface ApiSuccess<T> {
  data: T;
}

// --- TOC ---
export interface TOCItem {
  id: string;
  title: string;
  slug: string;
  order_index: number;
}

// --- Purchase ---
export type PurchaseStatus = "pending" | "completed" | "refunded" | "failed";

export interface Purchase {
  id: string;
  user_id: string;
  book_id: string;
  price_paid: number;
  payment_method: string | null;
  status: PurchaseStatus;
  /** 지금 이 구매를 열어 준 결제. 회수는 이 결제의 취소일 때만 합니다 (00005). */
  payment_transaction_id: string | null;
  purchased_at: string;
  created_at: string;
}

// --- Payment Transaction ---
export type PaymentTransactionStatus =
  | "ready"
  | "in_progress"
  | "done"
  | "canceled"
  | "partial_canceled"
  | "aborted"
  | "expired";

export interface PaymentTransaction {
  id: string;
  purchase_id: string | null;
  user_id: string;
  book_id: string;
  toss_payment_key: string | null;
  toss_order_id: string;
  amount: number;
  status: PaymentTransactionStatus;
  method: string | null;
  raw_response: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// --- Access Control ---
export type AccessReason = "owner" | "purchased" | "free" | "none";

export interface BookAccessResult {
  hasAccess: boolean;
  reason: AccessReason;
}

