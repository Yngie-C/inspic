"use client";

import { BookDetailView } from "@/app/book/[bookId]/BookDetailView";
import { DEV_BOOK, DEV_BOOKS, DEV_CHAPTERS } from "../_mock/book";

export function DevBook({ as }: { as: string }) {
  return (
    <BookDetailView
      book={{
        ...DEV_BOOK,
        author_name: "SecretTome",
        author_bio:
          "채용 담당자로 5년, 지원자로 3년을 보냈어요.\n지금은 클로드 코드로 반복 업무를 줄이는 방법을 가르쳐요.",
      }}
      chapters={DEV_CHAPTERS}
      isOwner={as === "owner"}
      access={
        as === "preview"
          ? { hasAccess: false, reason: "preview" }
          : { hasAccess: true, reason: "purchased" }
      }
      otherBooks={DEV_BOOKS.filter((b) => b.author_name === "SecretTome").slice(1, 5)}
      publishing={false}
      publishBlockers={null}
      publishError={null}
      onPublish={() => {}}
      onUnpublish={() => {}}
    />
  );
}
