"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PUBLISH_CONFIRM_MESSAGE, publishBook } from "@/lib/book-publish";
import type { PublishCheck } from "@/lib/publish-checks";

/**
 * 미리보기 옆 검수 패널.
 *
 * 공개는 편집 화면의 [공개하기]로 바로 할 수 있고, 이 패널은 저자가
 * 미리보기와 함께 확인하고 싶을 때 쓰는 곳입니다. 차단 항목이 하나라도
 * 있으면 공개 버튼이 잠깁니다. 강제는 API가 합니다.
 */

interface ChecksResponse {
  can_publish: boolean;
  blockers: PublishCheck[];
  warnings: PublishCheck[];
}

async function fetchChecks(bookId: string): Promise<ChecksResponse> {
  const res = await fetch(`/api/books/${bookId}/publish-checks`);
  if (!res.ok) throw new Error("검수 결과를 불러오지 못했어요.");
  return (await res.json()).data;
}

interface Props {
  bookId: string;
  /** 이미 공개된 책이면 다시 공개할 필요가 없습니다. */
  isPublished: boolean;
}

export function PublishChecklist({ bookId, isPublished }: Props) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery<ChecksResponse>({
    queryKey: ["publish-checks", bookId],
    queryFn: () => fetchChecks(bookId),
  });

  const handlePublish = async () => {
    if (!confirm(PUBLISH_CONFIRM_MESSAGE)) return;

    setPublishing(true);
    setPublishError(null);
    try {
      const result = await publishBook(bookId);
      if (result.ok) {
        router.push(`/book/${bookId}`);
        return;
      }
      if (result.kind === "blocked") {
        // 검수를 통과했다고 봤는데 서버가 막았다면 그 사이 본문이 바뀐
        // 것이므로 최신 결과를 다시 보여 줍니다.
        await refetch();
        setPublishError("공개하려면 고쳐야 할 곳이 있어요. 위 항목을 확인해 주세요.");
      } else {
        setPublishError(result.message);
      }
    } finally {
      setPublishing(false);
    }
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-paper">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-primary">확인할 항목</h2>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-lg p-1.5 text-muted hover:bg-mark hover:text-primary disabled:opacity-40"
          title="다시 검사"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        {error && (
          <p className="text-sm text-danger">
            검수 결과를 불러오지 못했어요.
          </p>
        )}

        {data && (
          <div className="space-y-4">
            {data.blockers.length === 0 && data.warnings.length === 0 && (
              <div className="flex items-start gap-2.5 rounded-lg p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <p className="text-sm text-success">
                  확인할 항목이 없어요. 바로 공개할 수 있어요.
                </p>
              </div>
            )}

            {data.blockers.map((check) => (
              <CheckItem key={check.id} check={check} />
            ))}
            {data.warnings.map((check) => (
              <CheckItem key={check.id} check={check} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-line px-5 py-4">
        {publishError && <p className="text-xs text-danger">{publishError}</p>}

        {isPublished ? (
          <p className="text-center text-sm text-muted">이미 공개한 책이에요.</p>
        ) : (
          <>
            <Button
              className="w-full"
              onClick={handlePublish}
              isLoading={publishing}
              disabled={!data?.can_publish || isFetching}
            >
              공개하기
            </Button>
            {data && !data.can_publish && (
              <p className="text-center text-xs text-muted">
                꼭 고쳐야 할 항목 {data.blockers.length}개를 해결하면 공개할 수 있어요.
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function CheckItem({ check }: { check: PublishCheck }) {
  const isBlocker = check.level === "blocker";

  return (
    <div
      className={`rounded-lg border p-3 ${
        isBlocker ? "border-danger/40" : "border-warning/40"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {isBlocker ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        )}
        <div className="min-w-0">
          <p
            className={`text-sm font-medium ${
              isBlocker ? "text-danger" : "text-warning"
            }`}
          >
            {check.title}
          </p>
          <p
            className={`mt-1 text-xs leading-relaxed ${
              isBlocker ? "text-danger" : "text-warning"
            }`}
          >
            {check.detail}
          </p>
        </div>
      </div>
    </div>
  );
}
