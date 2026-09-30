"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, TrendingDown } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { WorkbookEngagement } from "@/lib/workbook/engagement";

/**
 * "어느 블록에서 독자가 이탈하는가"를 보는 화면.
 *
 * 막대는 책 순서대로 늘어섭니다. 저자가 찾는 것은 절대값이 아니라
 * 뚝 떨어지는 자리입니다.
 */

const BLOCK_LABEL: Record<string, string> = {
  checklist: "체크리스트",
  reflection: "리플렉션",
  smart_goal: "SMART 목표",
  scale: "척도",
  callout: "콜아웃",
};

async function fetchEngagement(bookId: string): Promise<WorkbookEngagement> {
  const res = await fetch(
    `/api/analytics/workbook?bookId=${encodeURIComponent(bookId)}`,
  );
  if (!res.ok) throw new Error("참여 지표를 불러오지 못했습니다.");
  const json = await res.json();
  return json.data;
}

interface BookOption {
  id: string;
  title: string;
}

export function WorkbookEngagementSection({ books }: { books: BookOption[] }) {
  const [selectedId, setSelectedId] = useState<string>(books[0]?.id ?? "");

  const { data, isLoading, isError } = useQuery<WorkbookEngagement>({
    queryKey: ["workbook-engagement", selectedId],
    queryFn: () => fetchEngagement(selectedId),
    enabled: !!selectedId,
    staleTime: 60_000,
  });

  if (books.length === 0) return null;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-primary">워크북 참여</h2>

        {books.length > 1 && (
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="mb-4 flex items-start gap-1.5 text-xs text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {/* 이 안내가 없으면 저자가 자기 책을 테스트하고 0을 보고 고장 난 줄 압니다. */}
        본인이 미리보기에서 쓴 답은 집계에서 제외됩니다.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : isError ? (
        <p className="rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger">
          참여 지표를 불러오지 못했습니다.
        </p>
      ) : !data || data.chapters.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          이 책에는 아직 응답을 받을 워크북 블록이 없습니다.
        </p>
      ) : data.engaged_readers === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          아직 답을 쓴 독자가 없습니다.
        </p>
      ) : (
        <EngagementList engagement={data} />
      )}
    </div>
  );
}

function EngagementList({ engagement }: { engagement: WorkbookEngagement }) {
  const peak = engagement.engaged_readers;

  // 앞 블록보다 가장 크게 떨어진 자리를 표시합니다. 저자가 제일 먼저
  // 봐야 할 곳이라 눈에 띄게 둡니다.
  const ordered = engagement.chapters.flatMap((chapter) =>
    chapter.blocks.map((block) => ({ chapter, block })),
  );
  let biggestDropId: string | null = null;
  let biggestDrop = 0;
  for (let i = 1; i < ordered.length; i++) {
    const drop =
      ordered[i - 1].block.answered_readers - ordered[i].block.answered_readers;
    if (drop > biggestDrop) {
      biggestDrop = drop;
      biggestDropId = ordered[i].block.block_id;
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        워크북에 답을 쓴 독자{" "}
        <span className="font-semibold text-primary">{peak}명</span>
      </p>

      {engagement.chapters.map((chapter) => (
        <div key={chapter.chapter_id}>
          <h3 className="mb-2 text-sm font-medium text-muted">
            {chapter.title}
          </h3>

          <ul className="space-y-2">
            {chapter.blocks.map((block) => {
              const percent =
                peak > 0 ? Math.round((block.answered_readers / peak) * 100) : 0;
              const isDrop = block.block_id === biggestDropId;

              return (
                <li
                  key={block.block_id}
                  className={cn(
                    "rounded-lg border bg-surface p-3",
                    isDrop ? "border-warning/40" : "border-line",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-sm text-primary">
                      {BLOCK_LABEL[block.block_type] ?? block.block_type}
                      {isDrop && (
                        <span className="flex items-center gap-1 text-xs font-medium text-warning">
                          <TrendingDown className="h-3 w-3" />
                          가장 많이 이탈
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-medium text-primary">
                      {block.answered_readers}명
                      <span className="ml-1 text-xs font-normal text-muted">
                        {percent}%
                      </span>
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-mark">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        isDrop ? "bg-warning" : "bg-primary",
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* 문항이 여럿인 블록은 어느 항목에서 갈리는지가 따로 보입니다. */}
                  {block.fields.length > 1 && (
                    <ul className="mt-2 space-y-1">
                      {block.fields.map((field) => (
                        <li
                          key={field.field_key}
                          className="flex items-center justify-between gap-3 text-xs text-muted"
                        >
                          <span className="truncate">
                            {field.label || field.field_key}
                          </span>
                          <span className="shrink-0">{field.answered_count}명</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
