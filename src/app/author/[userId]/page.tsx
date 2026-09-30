"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { BookCover } from "@/components/ui/book-cover";
import { BookOpen } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

interface AuthorProfile {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface AuthorBook {
  id: string;
  title: string;
  cover_image_url: string | null;
  owner_id: string;
}

async function fetchAuthorProfile(userId: string): Promise<AuthorProfile | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();
  return data;
}

async function fetchAuthorBooks(userId: string): Promise<AuthorBook[]> {
  const res = await fetch(`/api/explore?author_id=${encodeURIComponent(userId)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data?.books ?? [];
}

export default function AuthorPage() {
  const { userId } = useParams<{ userId: string }>();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["author-profile", userId],
    queryFn: () => fetchAuthorProfile(userId),
    enabled: !!userId,
  });

  const { data: books, isLoading: booksLoading } = useQuery({
    queryKey: ["author-books", userId],
    queryFn: () => fetchAuthorBooks(userId),
    enabled: !!userId,
  });

  const isLoading = profileLoading || booksLoading;
  const displayName = profile?.display_name ?? "알 수 없는 저자";
  const initial = displayName.charAt(0).toUpperCase();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
      {/* Author profile header */}
      <div className="mb-10 flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-6">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {profile?.avatar_url ? (
            <div className="relative h-24 w-24 overflow-hidden rounded-full">
              <Image
                src={profile.avatar_url}
                alt={displayName}
                fill
                className="object-cover"
                sizes="96px"
              />
            </div>
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary">
              <span className="text-3xl font-bold text-on-accent select-none">
                {initial}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col gap-2">
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">
            {displayName}
          </h1>
          {profile?.bio && (
            <p className="max-w-xl text-sm leading-relaxed text-muted">
              {profile.bio}
            </p>
          )}
        </div>
      </div>

      {/* Books section */}
      <div>
        <h2 className="mb-6 text-lg font-semibold text-primary flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-muted" />
          이 저자의 전자책
        </h2>

        {!books || books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted">아직 공개된 전자책이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {books.map((book) => {
              return (
                <Link
                  key={book.id}
                  href={`/book/${book.id}`}
                  className="group flex flex-col gap-2.5 text-primary"
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-sm border border-primary/10">
                    <BookCover
                      bookId={book.id}
                      title={book.title}
                      coverImageUrl={book.cover_image_url}
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      size="md"
                    />
                  </div>
                  <div>
                    <p className="line-clamp-2 text-subtitle decoration-1 underline-offset-3 group-hover:underline">
                      {book.title}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
