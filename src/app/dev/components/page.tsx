import { notFound } from "next/navigation";
import { ComponentGallery } from "./ComponentGallery";

export const metadata = { title: "컴포넌트 검증" };

// DESIGN.md 프리미티브를 한 화면에서 확인하는 개발용 페이지. 프로덕션에서는 404다.
export default function DevComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ComponentGallery />;
}
