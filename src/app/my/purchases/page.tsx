"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/stores/auth-store";

interface Purchase {
  id: string;
  book_id: string;
  price_paid: number;
  purchased_at: string;
  status: string;
  books: {
    id: string;
    title: string;
  };
}

async function fetchPurchases(): Promise<Purchase[]> {
  const res = await fetch("/api/purchases");
  if (!res.ok) throw new Error("구매 내역을 불러오지 못했습니다.");
  const json = await res.json();
  return json.data ?? [];
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "text-success",
    pending: "text-warning",
    refunded: "text-muted",
    failed: "text-danger",
  };
  const labels: Record<string, string> = {
    completed: "완료",
    pending: "처리 중",
    refunded: "환불",
    failed: "실패",
  };
  const cls = styles[status] ?? "text-muted";
  const label = labels[status] ?? status;

  return (
    <span className={`inline-flex items-center text-caption font-semibold ${cls}`}>
      {label}
    </span>
  );
}

export default function PurchasesPage() {
  const user = useAuthStore((s) => s.user);

  const { data: purchases = [], isLoading, isError, refetch } = useQuery<Purchase[]>({
    queryKey: ["purchases"],
    queryFn: fetchPurchases,
    enabled: !!user,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">구매 내역</h1>
        <p className="mt-1 text-sm text-muted">결제한 전자책 내역을 확인하세요.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-danger/40 p-8 text-center text-danger">
          구매 내역을 불러오지 못했습니다.{" "}
          <button onClick={() => refetch()} className="underline">
            다시 시도
          </button>
        </div>
      ) : purchases.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface py-20 text-center">
          <p className="text-lg font-semibold text-primary">구매 내역이 없습니다</p>
          <p className="text-sm text-muted">결제가 완료되면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-mark">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  날짜
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  책 제목
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  금액
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  상태
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {purchases.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-mark transition-colors">
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-muted">
                    {new Date(purchase.purchased_at).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {purchase.books ? (
                      <Link
                        href={`/book/${purchase.book_id}`}
                        className="font-medium text-primary hover:text-muted hover:underline"
                      >
                        {purchase.books.title}
                      </Link>
                    ) : (
                      <span className="text-muted">삭제된 책</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-primary">
                    {purchase.price_paid.toLocaleString("ko-KR")}원
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <StatusBadge status={purchase.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
