import { notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { AuthorView } from "@/app/author/[userId]/AuthorView";
import { DEV_BOOKS } from "../_mock/book";

export const metadata = { title: "저자 페이지 검증" };

// 목 데이터로 저자 페이지를 그리는 개발용 페이지. 프로덕션에서는 404다.
// ?empty=1이면 소개·책이 없는 저자를 그린다.
export default async function DevAuthorPage({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { empty } = await searchParams;
  const bare = empty === "1";

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <AuthorView
        data={{
          profile: {
            user_id: "dev-owner",
            display_name: "SecretTome",
            bio: bare ? null : "채용 담당자 5년, 지원자 3년",
            about: bare
              ? null
              : "IT 회사 채용 담당자로 5년 동안 자소서 2만 장을 읽었어요.\n그 뒤 3년은 지원자로 돌아가 같은 서류를 직접 써 봤어요.\n\n지금은 클로드 코드로 반복 업무를 줄이는 방법을 가르쳐요.",
            avatar_url: null,
          },
          books: bare
            ? []
            : DEV_BOOKS.filter((b) => b.author_name === "SecretTome").map((b) => ({
                ...b,
                author_name: undefined,
              })),
        }}
      />
    </div>
  );
}
