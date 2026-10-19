import Link from "next/link";
import { Button } from "@/components/ui/button";

/** 저자로 참여하는 입구. 메인 영역은 독자 몫이라 여기 짧게 하나만 둡니다. */
export function CreatorInvite() {
  return (
    <section className="flex flex-col items-start justify-between gap-4 border-t border-line pb-14 pt-10 max-[600px]:pb-10 min-[601px]:flex-row min-[601px]:items-center">
      <div className="flex flex-col gap-1">
        <h2 className="text-subtitle text-primary">현장에서 쌓은 노하우를 책으로 내 보세요</h2>
        <p className="text-body-sm text-muted">
          원고 파일이 있으면 올려서 바로 시작할 수 있어요.
        </p>
      </div>
      <Button variant="secondary" asChild>
        <Link href="/auth/signup">크리에이터로 시작하기</Link>
      </Button>
    </section>
  );
}
