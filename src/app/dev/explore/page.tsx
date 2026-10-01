import { notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { DevExplore } from "./DevExplore";

export const metadata = { title: "탐색 검증" };

// 목 데이터로 탐색 카드·그리드·검색 막대를 그리는 개발용 페이지. 프로덕션에서는 404다.
// ?popular: 책이 적어 숨겨지는 인기 줄을 강제로 보인다.
export default async function DevExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ popular?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { popular } = await searchParams;
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <DevExplore showPopular={popular !== undefined} />
    </div>
  );
}
