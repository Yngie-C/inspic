"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Book, BookVisibility } from "@/types";

interface BookMetadataFormProps {
  book: Book;
  onSave: (updates: Partial<Book>) => Promise<void>;
}

const LANGUAGE_OPTIONS = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
];

// "링크 공유"(unlisted)는 고를 수 없습니다. 열어 주는 경로가 없어 고르면
// 아무에게도 보이지 않았습니다. 이미 그 값인 책만 현재 상태로 보여 줍니다.
const VISIBILITY_OPTIONS: { value: BookVisibility; label: string; description: string }[] = [
  {
    value: "private",
    label: "비공개",
    description: "새 독자에게는 보이지 않아요. 이미 구매한 독자는 계속 읽을 수 있어요",
  },
  { value: "public", label: "공개", description: "누구나 탐색 화면에서 찾고 볼 수 있어요" },
];

const RETIRED_UNLISTED_OPTION = {
  value: "unlisted" as const,
  label: "링크 공유 (더 이상 고를 수 없음)",
  description: "지금은 나와 구매한 독자만 볼 수 있어요. 공개나 비공개로 바꿔 주세요",
};

export function BookMetadataForm({ book, onSave }: BookMetadataFormProps) {
  const [title, setTitle] = useState(book.title);
  const [description, setDescription] = useState(book.description ?? "");
  const [language, setLanguage] = useState(book.language);
  const [visibility, setVisibility] = useState<BookVisibility>(book.visibility);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [coverUrl, setCoverUrl] = useState(book.cover_image_url ?? "");
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ title: title.trim(), description: description.trim() || null, language, visibility });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const uploadCover = useCallback(async (file: File) => {
    const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
    if (!ALLOWED.includes(file.type)) {
      setCoverError("JPEG, PNG, WebP 이미지만 올릴 수 있어요.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCoverError("이미지는 5MB 이하만 올릴 수 있어요.");
      return;
    }

    setCoverError(null);
    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`/api/books/${book.id}/cover`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "표지를 올리지 못했어요.");
      }
      const json = await res.json();
      setCoverUrl(json.data.cover_image_url);
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "표지를 올리지 못했어요.");
    } finally {
      setCoverUploading(false);
    }
  }, [book.id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadCover(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadCover(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleRemoveCover = async () => {
    if (!confirm("표지 이미지를 삭제할까요?")) return;
    setCoverUploading(true);
    setCoverError(null);
    try {
      const res = await fetch(`/api/books/${book.id}/cover`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      setCoverUrl("");
    } catch {
      setCoverError("표지를 삭제하지 못했어요.");
    } finally {
      setCoverUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Cover image */}
      <div>
        <label className="mb-2 block text-sm font-medium text-primary">표지 이미지</label>
        <div className="relative">
          {coverUrl ? (
            <div className="group relative w-full overflow-hidden rounded-lg border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverUrl}
                alt="표지 이미지"
                className="h-48 w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-primary/0 transition-colors duration-150 ease-out group-hover:bg-primary/40">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="hidden rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-primary group-hover:flex"
                >
                  교체
                </button>
                <button
                  type="button"
                  onClick={handleRemoveCover}
                  className="hidden rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-surface group-hover:flex"
                >
                  삭제
                </button>
              </div>
              {coverUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-surface/70">
                  <Loader2 className="h-6 w-6 animate-spin text-muted" />
                </div>
              )}
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                "flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors",
                isDragging
                  ? "border-primary bg-mark"
                  : "border-line-strong hover:border-line-strong hover:bg-mark",
                coverUploading && "pointer-events-none opacity-60",
              )}
            >
              {coverUploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted" />
              ) : (
                <>
                  <ImageIcon className="h-8 w-8 text-muted" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-muted">표지 이미지 올리기</p>
                    <p className="text-xs text-muted">JPEG, PNG, WebP · 최대 5MB</p>
                    <p className="text-xs text-muted">끌어다 놓거나 눌러서 고르세요</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {coverError && <p className="mt-1.5 text-xs text-danger">{coverError}</p>}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Title */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-primary">
          제목 <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="책 제목"
          className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-primary">소개</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="이 책을 읽고 독자가 할 수 있게 되는 일을 적어 주세요"
          rows={4}
          className="w-full resize-none rounded-lg border border-line-strong px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Language */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-primary">언어</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Visibility */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-primary">공개 설정</label>
        <div className="flex flex-col gap-2">
          {(book.visibility === "unlisted"
            ? [RETIRED_UNLISTED_OPTION, ...VISIBILITY_OPTIONS]
            : VISIBILITY_OPTIONS
          ).map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                visibility === opt.value
                  ? "border-primary bg-mark"
                  : "border-line hover:border-line-strong",
              )}
            >
              <input
                type="radio"
                name="visibility"
                value={opt.value}
                checked={visibility === opt.value}
                onChange={() => setVisibility(opt.value)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-primary">{opt.label}</p>
                <p className="text-xs text-muted">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Status display */}
      <div className="rounded-lg bg-mark px-3 py-2">
        <span className="text-xs text-muted">상태: </span>
        <span className="text-xs font-medium text-primary">
          {book.status === "draft" && "초안"}
          {book.status === "processing" && "처리 중"}
          {book.status === "published" && "공개 중"}
          {book.status === "archived" && "보관됨"}
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button onClick={handleSave} isLoading={saving} disabled={saving}>
        {saved ? "저장됨" : "저장"}
      </Button>
    </div>
  );
}
