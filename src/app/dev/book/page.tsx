import { notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { DevBook } from "./DevBook";

export const metadata = { title: "책 상세 검증" };

// 목 데이터로 책 상세를 그리는 개발용 페이지. 프로덕션에서는 404다.
// ?as=owner(소유자), ?as=preview(유료·미리보기), 기본은 구매한 독자.
export default async function DevBookPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { as } = await searchParams;
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <DevBook as={as ?? "reader"} />
    </div>
  );
}
