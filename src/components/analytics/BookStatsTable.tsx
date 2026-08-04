"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookStat {
  id: string;
  title: string;
  status: string;
  total_chapters: number;
  total_words: number;
  readers: number;
}

interface BookStatsTableProps {
  books: BookStat[];
  className?: string;
}

type SortKey = keyof Pick<
  BookStat,
  "title" | "total_chapters" | "total_words" | "readers"
>;

type SortDir = "asc" | "desc";

interface Column {
  key: SortKey;
  label: string;
  align?: "left" | "right";
  render: (book: BookStat) => React.ReactNode;
}

const STATUS_LABELS: Record<string, string> = {
  published: "발행됨",
  draft: "초안",
  processing: "처리중",
  archived: "보관됨",
};

const STATUS_COLORS: Record<string, string> = {
  published: "bg-green-100 text-green-700",
  draft: "bg-gray-100 text-gray-600",
  processing: "bg-blue-100 text-blue-700",
  archived: "bg-orange-100 text-orange-700",
};

const COLUMNS: Column[] = [
  {
    key: "title",
    label: "제목",
    align: "left",
    render: (book) => (
      <div>
        <p className="font-medium text-gray-900 truncate max-w-[200px]">
          {book.title}
        </p>
        <span
          className={cn(
            "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
            STATUS_COLORS[book.status] ?? "bg-gray-100 text-gray-600",
          )}
        >
          {STATUS_LABELS[book.status] ?? book.status}
        </span>
      </div>
    ),
  },
  {
    key: "total_chapters",
    label: "챕터",
    align: "right",
    render: (book) => (
      <span className="text-gray-700">{book.total_chapters}</span>
    ),
  },
  {
    key: "total_words",
    label: "단어수",
    align: "right",
    render: (book) => (
      <span className="text-gray-700">
        {book.total_words.toLocaleString()}
      </span>
    ),
  },
  {
    key: "readers",
    label: "독자",
    align: "right",
    render: (book) => (
      <span className="text-gray-700">{book.readers.toLocaleString()}</span>
    ),
  },
];

export function BookStatsTable({ books, className }: BookStatsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("readers");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...books].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc"
        ? aVal.localeCompare(bVal, "ko")
        : bVal.localeCompare(aVal, "ko");
    }
    return sortDir === "asc"
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  if (books.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-gray-200 bg-white p-8",
          className,
        )}
      >
        <p className="text-sm text-gray-400">콘텐츠가 없습니다</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-gray-200 bg-white",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    "cursor-pointer select-none px-5 py-3 font-medium text-gray-500 transition-colors hover:text-gray-900",
                    col.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === "asc" ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5 text-gray-300" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((book, idx) => (
              <tr
                key={book.id}
                className={cn(
                  "transition-colors hover:bg-gray-50",
                  idx > 0 && "border-t border-gray-100",
                )}
              >
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-5 py-3.5",
                      col.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {col.render(book)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
