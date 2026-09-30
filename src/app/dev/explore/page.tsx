import { notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { DesignVariantProvider } from "@/components/ui/design-variants";
import { DevExplore } from "./DevExplore";

export const metadata = { title: "탐색 검증" };

// 목 데이터로 탐색 카드·그리드·검색 막대를 그리는 개발용 페이지. 프로덕션에서는 404다.
// 비교용 변형(단계 5, 임시): ?callout=box|line|mark, ?cover=current|no-rosewood|light
export default async function DevExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ callout?: string; cover?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { callout, cover } = await searchParams;
  return (
    <DesignVariantProvider callout={callout} cover={cover}>
      <div className="min-h-screen bg-paper">
        <Header />
        <DevExplore />
      </div>
    </DesignVariantProvider>
  );
}
