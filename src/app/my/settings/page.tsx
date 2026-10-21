"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AuthorAvatar } from "@/components/ui/author-avatar";
import { FormAlert } from "@/components/auth/FormAlert";
import {
  MAX_ABOUT_LENGTH,
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
} from "@/lib/authoring-input";
import type { UserProfile } from "@/types";

const TEXTAREA_CLASS =
  "w-full resize-y rounded-md border border-field-line bg-field px-3 py-2 text-body text-primary placeholder:text-muted transition-colors duration-150 ease-out focus:outline-2 focus:outline-offset-1 focus:outline-primary";

/** API가 돌려준 한국어 안내. 없으면 일반 문구입니다 — 원문 에러는 내지 않습니다. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const json = await res.json();
    return typeof json?.error === "string" ? json.error : fallback;
  } catch {
    return fallback;
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  useEffect(() => {
    if (!user) router.push("/auth/login");
  }, [user, router]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="text-title text-primary">설정</h1>
        <p className="text-body text-muted">
          책을 내면 여기 적은 이름·소개·이력이 저자 페이지와 책 상세에 표시돼요.
          {user && (
            <>
              {" "}
              <Link
                href={`/author/${user.id}`}
                className="text-primary underline decoration-1 underline-offset-3"
              >
                저자 페이지 보기
              </Link>
            </>
          )}
        </p>
      </div>

      {user && profile ? (
        // 다른 계정으로 바뀌면 폼을 새로 채웁니다. 사진을 바꿔도 쓰던 글은 그대로 둡니다.
        <div className="flex flex-col gap-6 rounded-lg border border-line bg-surface p-6 sm:p-8">
          <AvatarField profile={profile} email={user.email} />
          <ProfileForm key={profile.id} profile={profile} />
        </div>
      ) : (
        <div className="flex justify-center py-16 text-muted">
          <Spinner size="lg" />
        </div>
      )}
    </main>
  );
}

function AvatarField({ profile, email }: { profile: UserProfile; email?: string }) {
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (request: () => Promise<Response>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await request();
      if (!res.ok) {
        setError(await errorMessage(res, fallback));
        return;
      }
      await fetchProfile();
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("image", file);
    void run(
      () => fetch("/api/my/avatar", { method: "POST", body: form }),
      "사진을 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    );
  };

  const handleRemove = () => {
    if (!confirm("프로필 사진을 지울까요?")) return;
    void run(
      () => fetch("/api/my/avatar", { method: "DELETE" }),
      "사진을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    );
  };

  const name = profile.display_name || email?.split("@")[0] || "사용자";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <AuthorAvatar name={name} url={profile.avatar_url} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-col">
            <p className="truncate text-subtitle text-primary">{name}</p>
            {email && <p className="truncate text-body-sm text-muted">{email}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={busy}
              onClick={() => inputRef.current?.click()}
            >
              {profile.avatar_url ? "사진 바꾸기" : "사진 올리기"}
            </Button>
            {profile.avatar_url && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleRemove}>
                사진 지우기
              </Button>
            )}
            <span className="text-caption text-muted">JPEG, PNG, WebP · 최대 5MB</span>
          </div>
        </div>
      </div>
      {error && <p className="text-caption text-danger">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}

function ProfileForm({ profile }: { profile: UserProfile }) {
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [about, setAbout] = useState(profile.about ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess(false);

    const fallback = "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
    try {
      const res = await fetch("/api/my/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName, bio, about }),
      });
      if (!res.ok) {
        setError(await errorMessage(res, fallback));
        return;
      }
      await fetchProfile();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError(fallback);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      {error && <FormAlert>{error}</FormAlert>}
      {success && <FormAlert tone="success">저장했어요.</FormAlert>}

      <Input
        id="profile-name"
        label="이름"
        type="text"
        placeholder="홍길동"
        value={displayName}
        maxLength={MAX_DISPLAY_NAME_LENGTH}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      <div className="flex flex-col gap-1.5">
        <Input
          id="profile-bio"
          label="한 줄 소개"
          type="text"
          placeholder="예) 10년차 B2B 마케터, 스타트업 3곳의 첫 마케터"
          value={bio}
          maxLength={MAX_BIO_LENGTH}
          onChange={(e) => setBio(e.target.value)}
        />
        <p className="text-caption text-muted">
          이름 아래와 책 카드에 한 줄로 나가요. {bio.length}/{MAX_BIO_LENGTH}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-about" className="text-body-sm font-semibold text-primary">
          이력
        </label>
        <textarea
          id="profile-about"
          placeholder={"어떤 현장에서 무엇을 해 왔는지 적어 주세요.\n예) 2015년부터 B2B SaaS 마케팅을 맡아 리드 0에서 월 2천 건까지 만들었어요."}
          value={about}
          maxLength={MAX_ABOUT_LENGTH}
          onChange={(e) => setAbout(e.target.value)}
          rows={8}
          className={TEXTAREA_CLASS}
        />
        <p className="text-caption text-muted">
          저자 페이지와 책 상세 &quot;지은이&quot;에 나가요. {about.length}/{MAX_ABOUT_LENGTH}
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" isLoading={isLoading}>
          저장
        </Button>
      </div>
    </form>
  );
}
