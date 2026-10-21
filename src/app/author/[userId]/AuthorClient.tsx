"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AuthorView, type AuthorData } from "./AuthorView";

/** 없는 저자(404)와 불러오지 못한 것(5xx)은 다른 안내입니다. */
class AuthorLoadError extends Error {
  constructor(readonly status: number) {
    super("저자 정보를 불러오지 못했어요.");
  }
}

async function fetchAuthor(userId: string): Promise<AuthorData> {
  const res = await fetch(`/api/authors/${encodeURIComponent(userId)}`);
  if (!res.ok) throw new AuthorLoadError(res.status);
  const json = await res.json();
  return json.data;
}

export function AuthorClient() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();

  const { data, isLoading, isError, error, refetch } = useQuery<AuthorData>({
    queryKey: ["author", userId],
    queryFn: () => fetchAuthor(userId),
    enabled: !!userId,
    retry: (count, err) => !(err instanceof AuthorLoadError && err.status === 404) && count < 2,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !data) {
    // 일시 장애를 "없는 저자"로 안내하지 않습니다.
    const notFound = error instanceof AuthorLoadError && error.status === 404;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-1 px-4 text-center">
        <p className="text-subtitle text-primary">
          {notFound ? "저자를 찾을 수 없어요" : "저자 정보를 불러오지 못했어요"}
        </p>
        <p className="text-body-sm text-muted">
          {notFound ? "주소가 바뀌었거나 탈퇴한 저자일 수 있어요." : "잠시 뒤 다시 시도해 주세요."}
        </p>
        {notFound ? (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => router.back()}>
            돌아가기
          </Button>
        ) : (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
            다시 시도
          </Button>
        )}
      </div>
    );
  }

  return <AuthorView data={data} />;
}
