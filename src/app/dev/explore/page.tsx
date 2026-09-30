import { notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { DevExplore } from "./DevExplore";

export const metadata = { title: "탐색 검증" };

// 목 데이터로 탐색 카드·그리드·검색 막대를 그리는 개발용 페이지. 프로덕션에서는 404다.
export default function DevExplorePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <DevExplore />
    </div>
  );
}
