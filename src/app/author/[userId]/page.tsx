"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
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

const GRADIENT_COLORS = [
  "from-blue-400 to-indigo-600",
  "from-purple-400 to-pink-600",
  "from-green-400 to-teal-600",
  "from-orange-400 to-red-600",
];

function getGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) & 0xffffffff;
  }
  return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
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
            <div className="relative h-24 w-24 overflow-hidden rounded-full shadow-md">
              <Image
                src={profile.avatar_url}
                alt={displayName}
                fill
                className="object-cover"
                sizes="96px"
              />
            </div>
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-900 shadow-md">
              <span className="text-3xl font-bold text-white select-none">
                {initial}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col gap-2">
          <h1 className="font-logo text-2xl font-bold text-gray-900 sm:text-3xl">
            {displayName}
          </h1>
          {profile?.bio && (
            <p className="max-w-xl text-sm leading-relaxed text-gray-500">
              {profile.bio}
            </p>
          )}
        </div>
      </div>

      {/* Books section */}
      <div>
        <h2 className="mb-6 text-lg font-semibold text-gray-900 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-gray-400" />
          이 저자의 전자책
        </h2>

        {!books || books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-gray-400">아직 공개된 전자책이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {books.map((book) => {
              const gradient = getGradient(book.title);
              return (
                <Link
                  key={book.id}
                  href={`/book/${book.id}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm hover:-translate-y-2 hover:shadow-lg transition-all duration-300"
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden">
                    {book.cover_image_url ? (
                      <Image
                        src={book.cover_image_url}
                        alt={book.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                    ) : (
                      <div
                        className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}
                      >
                        <span className="text-4xl font-bold text-white/80 select-none">
                          {book.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-gray-700">
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
