import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Spinner } from "@/components/ui/spinner";
import { BookDetailClient } from "./BookDetailClient";

interface Props {
  params: Promise<{ bookId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { bookId } = await params;

  try {
    const supabase = await createClient();
    const { data: book } = await supabase
      .from("books")
      .select("title, description, cover_image_url, language")
      .eq("id", bookId)
      .single();

    if (!book) {
      return { title: "책을 찾을 수 없어요" };
    }

    const title = book.title;
    const description = book.description || `${book.title} - inspic에서 읽기`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "article",
        ...(book.cover_image_url && { images: [{ url: book.cover_image_url }] }),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        ...(book.cover_image_url && { images: [book.cover_image_url] }),
      },
    };
  } catch {
    return { title: "inspic" };
  }
}

export default function BookDetailPage() {
  return (
    <Suspense fallback={<BookDetailSkeleton />}>
      <BookDetailClient />
    </Suspense>
  );
}

// 로딩 뼈대(shimmer) 대신 Spinner를 쓴다 (DESIGN.md Motion).
function BookDetailSkeleton() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-muted">
      <Spinner size="lg" />
    </div>
  );
}
