import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PreviewClient } from "./PreviewClient";

interface Props {
  params: Promise<{ bookId: string }>;
}

export default async function PreviewPage({ params }: Props) {
  const { bookId } = await params;
  const supabase = await createClient();

  // getUser() 대신 getSession()을 사용 — 미들웨어가 이미 인증을 검증했으므로
  // JWT에서 user 정보만 읽어 lock 충돌(AbortError: 'steal')을 방지
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/login");

  const { data: book } = await supabase
    .from("books")
    .select("id, title, owner_id, status, visibility")
    .eq("id", bookId)
    .single();

  if (!book || book.owner_id !== user.id) {
    redirect("/creator");
  }

  return (
    <PreviewClient
      bookId={bookId}
      bookTitle={book.title}
      // 내렸던 책(published + private)도 다시 공개할 수 있어야 합니다.
      isPublished={book.status === "published" && book.visibility === "public"}
    />
  );
}
