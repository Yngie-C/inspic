import { notFound } from "next/navigation";
import { DesignVariantProvider } from "@/components/ui/design-variants";
import { DevReader } from "./DevReader";

export const metadata = { title: "리더 검증" };

// 목 데이터로 리더와 워크북 블록 5종을 그리는 개발용 페이지. 프로덕션에서는 404다.
// ?mode=local(저장 불가 안내), ?mode=error(저장 실패), ?mode=preview(미리보기 끝)
// 비교용 변형(단계 5, 임시): ?callout=box|line|mark, ?cover=current|no-rosewood|light
export default async function DevReaderPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; callout?: string; cover?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { mode, callout, cover } = await searchParams;
  return (
    <DesignVariantProvider callout={callout} cover={cover}>
      <DevReader mode={mode ?? "ok"} />
    </DesignVariantProvider>
  );
}
