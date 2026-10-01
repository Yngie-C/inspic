import { notFound } from "next/navigation";
import { DevReader } from "./DevReader";

export const metadata = { title: "리더 검증" };

// 목 데이터로 리더와 워크북 블록 5종을 그리는 개발용 페이지. 프로덕션에서는 404다.
// ?mode=local(저장 불가 안내), ?mode=error(저장 실패), ?mode=preview(미리보기 끝)
export default async function DevReaderPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { mode } = await searchParams;
  return <DevReader mode={mode ?? "ok"} />;
}
