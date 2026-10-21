import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Spinner } from "@/components/ui/spinner";
import { isUuid } from "@/lib/template-node-id";
import { SERVICE_NAME } from "@/lib/brand";
import { AuthorClient } from "./AuthorClient";

interface Props {
  params: Promise<{ userId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  if (!isUuid(userId)) return { title: "저자를 찾을 수 없어요" };

  try {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("display_name, bio, avatar_url")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile?.display_name) return { title: "저자를 찾을 수 없어요" };

    const title = profile.display_name;
    const description = profile.bio || `${profile.display_name}의 실전 워크북 - ${SERVICE_NAME}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "profile",
        ...(profile.avatar_url && { images: [{ url: profile.avatar_url }] }),
      },
      twitter: { card: "summary", title, description },
    };
  } catch {
    return { title: SERVICE_NAME };
  }
}

export default function AuthorPage() {
  return (
    <Suspense fallback={<AuthorSkeleton />}>
      <AuthorClient />
    </Suspense>
  );
}

// 로딩 뼈대(shimmer) 대신 Spinner를 쓴다 (DESIGN.md Motion).
function AuthorSkeleton() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-muted">
      <Spinner size="lg" />
    </div>
  );
}
