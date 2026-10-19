import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { LandingHero } from "@/components/landing/LandingHero";
import { NewBooksSection } from "@/components/landing/NewBooksSection";
import { ApplySection } from "@/components/landing/ApplySection";
import { CreatorInvite } from "@/components/landing/CreatorInvite";

/**
 * 메인 페이지 — 시안 A "책 먼저" (docs/design/landing-plan.md).
 *
 * 서버 컴포넌트입니다. 문구는 HTML로 바로 나가고, 책 목록만 클라이언트에서
 * 불러옵니다. 메인 영역에는 워크북을 드러내지 않고 적용 섹션에서만 보여 줍니다.
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Header />

      <main className="mx-auto flex w-full max-w-[936px] flex-1 flex-col px-4 min-[601px]:px-6">
        <LandingHero />
        <NewBooksSection />
        <ApplySection />
        <CreatorInvite />
      </main>

      <Footer />
    </div>
  );
}
