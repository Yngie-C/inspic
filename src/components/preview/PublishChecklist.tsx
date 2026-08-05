"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { PublishCheck } from "@/lib/publish-checks";

/**
 * 공개 전 검수 패널.
 *
 * 차단 항목이 하나라도 있으면 공개 버튼이 잠깁니다. 서버도 같은 판정을
 * 다시 하므로 이 화면은 이유를 설명하는 역할이고, 강제는 API가 합니다.
 */

interface ChecksResponse {
  can_publish: boolean;
  blockers: PublishCheck[];
  warnings: PublishCheck[];
}

async function fetchChecks(bookId: string): Promise<ChecksResponse> {
  const res = await fetch(`/api/books/${bookId}/publish-checks`);
  if (!res.ok) throw new Error("검수 결과를 불러오지 못했습니다.");
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
    if (!confirm("이 책을 공개하시겠습니까? 공개 후에도 수정할 수 있습니다.")) {
      return;
    }

    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // visibility를 함께 보내야 실제로 독자에게 보입니다. status만
        // 바꾸면 published + private이라 아무도 찾을 수 없습니다.
        body: JSON.stringify({ status: "published", visibility: "public" }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 검수를 통과했다고 봤는데 서버가 막았다면 그 사이 본문이 바뀐
        // 것이므로 최신 결과를 다시 보여 줍니다.
        await refetch();
        throw new Error(json.error ?? "공개하지 못했습니다.");
      }

      router.push(`/book/${bookId}`);
    } catch (err) {
      setPublishError(
        err instanceof Error ? err.message : "공개하지 못했습니다.",
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">공개 전 검수</h2>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
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
          <p className="text-sm text-red-600">
            검수 결과를 불러오지 못했습니다.
          </p>
        )}

        {data && (
          <div className="space-y-4">
            {data.blockers.length === 0 && data.warnings.length === 0 && (
              <div className="flex items-start gap-2.5 rounded-lg bg-green-50 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <p className="text-sm text-green-800">
                  확인할 항목이 없습니다. 공개할 준비가 됐습니다.
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

      <div className="space-y-2 border-t border-gray-100 px-5 py-4">
        {publishError && <p className="text-xs text-red-600">{publishError}</p>}

        {isPublished ? (
          <p className="text-center text-sm text-gray-500">이미 공개된 책입니다.</p>
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
              <p className="text-center text-xs text-gray-400">
                차단 항목 {data.blockers.length}개를 해결해야 공개할 수 있습니다.
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
        isBlocker ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {isBlocker ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        )}
        <div className="min-w-0">
          <p
            className={`text-sm font-medium ${
              isBlocker ? "text-red-900" : "text-amber-900"
            }`}
          >
            {check.title}
          </p>
          <p
            className={`mt-1 text-xs leading-relaxed ${
              isBlocker ? "text-red-700" : "text-amber-700"
            }`}
          >
            {check.detail}
          </p>
        </div>
      </div>
    </div>
  );
}
