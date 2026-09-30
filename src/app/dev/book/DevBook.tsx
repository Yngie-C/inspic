"use client";

import { BookDetailView } from "@/app/book/[bookId]/BookDetailView";
import { DEV_BOOK, DEV_BOOKS, DEV_CHAPTERS } from "../_mock/book";

export function DevBook({ as }: { as: string }) {
  return (
    <BookDetailView
      book={{ ...DEV_BOOK, author_name: "inspic" }}
      chapters={DEV_CHAPTERS}
      isOwner={as === "owner"}
      access={
        as === "preview"
          ? { hasAccess: false, reason: "preview" }
          : { hasAccess: true, reason: "purchased" }
      }
      otherBooks={DEV_BOOKS.slice(1, 4)}
      publishing={false}
      onTogglePublish={() => {}}
    />
  );
}
