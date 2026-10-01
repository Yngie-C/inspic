"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
      setAvatarUrl(profile.avatar_url ?? "");
    }
  }, [user, profile, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    setError("");
    setSuccess(false);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (updateError) throw new Error(updateError.message);

      await fetchProfile();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary">설정</h1>
        <p className="mt-1 text-muted">이름과 소개를 바꿀 수 있어요. 책을 내면 저자 페이지에 표시돼요.</p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-8">
        {/* Avatar preview */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-primary text-xl font-bold text-on-primary">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              (displayName || user?.email || "U")[0].toUpperCase()
            )}
          </div>
          <div>
            <p className="font-medium text-primary">
              {displayName || user?.email?.split("@")[0] || "사용자"}
            </p>
            <p className="text-sm text-muted">{user?.email}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-5">
          {error && (
            <div className="rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-success/40 px-4 py-3 text-sm text-success">
              <Check className="h-4 w-4" />
              저장했어요.
            </div>
          )}

          <Input
            label="이름"
            type="text"
            placeholder="홍길동"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-primary">소개</label>
            <textarea
              placeholder="어떤 일을 하는 사람인지 한두 줄로 적어 주세요"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-primary placeholder:text-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <Input
            label="아바타 URL"
            type="url"
            placeholder="https://example.com/avatar.png"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
          />

          <div className="flex justify-end pt-2">
            <Button type="submit" isLoading={isLoading}>
              저장
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
