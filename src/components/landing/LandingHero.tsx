import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 메인 영역. 독자만 상대하고, 체크리스트·질문·워크북은 말하지 않습니다 —
 * 그것은 도구이고, 첫 화면에서 앞세우면 무슨 서비스인지 흐려집니다.
 */
export function LandingHero() {
  return (
    <section className="flex flex-col items-start gap-6 pb-14 pt-14 max-[600px]:pb-10 max-[600px]:pt-10">
      <div className="flex max-w-[34em] flex-col gap-3">
        {/* 쉼표에서 끊습니다. 맡겨 두면 "내 / 일에"로 갈라집니다. */}
        <h1 className="text-display text-primary max-[600px]:text-[25px]">
          해 본 사람이 쓴 책을,
          <br />
          내 일에 바로 적용해 보세요
        </h1>
        <p className="text-body text-muted">
          현장에서 직접 부딪혀 본 사람이 쓴 책이에요. 그 사람이 실제로 쓰던
          방법을 내 일에 그대로 가져가 보세요.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button size="lg" asChild>
          <Link href="/explore">책 둘러보기</Link>
        </Button>
        <p className="text-caption text-muted">첫 장은 사지 않아도 읽을 수 있어요</p>
      </div>
    </section>
  );
}
