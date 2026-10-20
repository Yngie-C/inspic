"use client";

import Link from "next/link";
import { BlockUnavailable } from "@/components/ui/workbook-block";
import { bookHref, loginHref } from "../reader-links";
import { useWorkbookBookId, type BlockLock } from "../WorkbookResponsesProvider";

const linkClass =
  "font-semibold text-primary underline decoration-1 underline-offset-3";

/**
 * 블록이 입력을 받지 않는 이유를 한 줄로 알립니다. 이유는
 * `useBlockResponses().lock`이 정하고, 여기서는 문구만 고릅니다.
 *
 * 계정에 저장할 수 없는 독자에게는 경고가 아니라 초대입니다 — 잃는 답이
 * 없으므로 박스나 색 없이 `BlockUnavailable`과 같은 muted 한 줄로 둡니다.
 */
export function BlockLockNotice({ lock }: { lock: BlockLock | null }) {
  const bookId = useWorkbookBookId();

  if (lock === null) return null;
  if (lock === "unavailable") return <BlockUnavailable />;

  return (
    <p className="m-0 text-body-sm text-muted">
      {lock === "sign-in" ? (
        <>
          <Link href={loginHref(bookId)} className={linkClass}>
            로그인
          </Link>
          하면 여기에 바로 쓸 수 있어요.
        </>
      ) : (
        <>
          구매하면 여기에 쓸 수 있어요.{" "}
          <Link href={bookHref(bookId)} className={linkClass}>
            책 정보 보기
          </Link>
        </>
      )}
    </p>
  );
}
