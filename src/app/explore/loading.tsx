import { Spinner } from "@/components/ui/spinner";

// DESIGN.md Motion: 로딩 shimmer 대신 Spinner를 쓴다.
export default function ExploreLoading() {
  return (
    <div className="flex justify-center py-24 text-muted">
      <Spinner size="lg" />
    </div>
  );
}
