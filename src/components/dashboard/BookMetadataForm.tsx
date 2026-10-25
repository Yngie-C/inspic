"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MAX_AUDIENCE_LENGTH,
  MAX_BOOK_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_DETAIL_IMAGE_ALT_LENGTH,
} from "@/lib/authoring-input";
import type { Book } from "@/types";

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

/** 독자에게 보이는 것은 published + public일 때뿐입니다. */
function statusLabel(book: Book): string {
  switch (book.status) {
    case "published":
      return book.visibility === "public" ? "공개 중" : "비공개 · 구매한 독자만";
    case "processing":
      return "처리 중";
    case "archived":
      return "보관됨";
    default:
      return "초안";
  }
}

export function BookMetadataForm({ book, onSave }: BookMetadataFormProps) {
  const [title, setTitle] = useState(book.title);
  const [description, setDescription] = useState(book.description ?? "");
  const [audience, setAudience] = useState(book.audience ?? "");
  const [language, setLanguage] = useState(book.language);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detailImageAlt, setDetailImageAlt] = useState(book.detail_image_alt ?? "");
  const [hasDetailImage, setHasDetailImage] = useState(!!book.detail_image_url);

  const handleSave = async () => {
    if (!title.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        audience: audience.trim() || null,
        detail_image_alt: detailImageAlt.trim() || null,
        language,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ImageUploadField
        label="표지 이미지"
        endpoint={`/api/books/${book.id}/cover`}
        column="cover_image_url"
        noun="표지"
        initialUrl={book.cover_image_url}
      />

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
          maxLength={MAX_BOOK_TITLE_LENGTH}
          className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-primary">책 소개</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="이 책을 읽고 독자가 할 수 있게 되는 일을 적어 주세요"
          rows={4}
          maxLength={MAX_DESCRIPTION_LENGTH}
          className="w-full resize-none rounded-lg border border-line-strong px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* 책 상세의 "이런 분께". 줄마다 목록 항목 하나로 보입니다. */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-primary">이런 분께</label>
        <textarea
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder={"한 줄에 한 사람씩 적어 주세요.\n예) 처음 팀장을 맡은 사람"}
          rows={3}
          maxLength={MAX_AUDIENCE_LENGTH}
          className="w-full resize-none rounded-lg border border-line-strong px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* 책 상세의 "책 소개" 아래에 보이는 이미지 한 장. 선택사항입니다. */}
      <div className="flex flex-col gap-2">
        <ImageUploadField
          label="소개 이미지 (선택)"
          hint="책 상세의 책 소개 아래에 그대로 보여요. 세로로 긴 이미지도 괜찮아요."
          endpoint={`/api/books/${book.id}/detail-image`}
          column="detail_image_url"
          noun="소개 이미지"
          initialUrl={book.detail_image_url}
          previewClassName="object-top"
          onChange={(url) => setHasDetailImage(!!url)}
        />
        {hasDetailImage && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-primary">
              이미지 설명
            </label>
            <textarea
              value={detailImageAlt}
              onChange={(e) => setDetailImageAlt(e.target.value)}
              placeholder="이미지 속 글을 옮겨 적어 주세요. 화면 낭독기를 쓰는 독자에게 읽혀요."
              rows={3}
              maxLength={MAX_DETAIL_IMAGE_ALT_LENGTH}
              className="w-full resize-none rounded-lg border border-line-strong px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
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

      {/* 공개·비공개는 편집 화면 상단 버튼 하나로만 바꿉니다. 여기서
          visibility만 바꾸면 초안 책은 "공개"를 골라도 보이지 않았습니다. */}
      <div className="rounded-lg bg-mark px-3 py-2">
        <p>
          <span className="text-xs text-muted">상태: </span>
          <span className="text-xs font-medium text-primary">{statusLabel(book)}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted">공개·비공개는 편집 화면 상단에서 바꿔요.</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button onClick={handleSave} isLoading={saving} disabled={saving}>
        {saved ? "저장됨" : "저장"}
      </Button>
    </div>
  );
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface ImageUploadFieldProps {
  label: string;
  hint?: string;
  /** POST로 올리고 DELETE로 지웁니다. */
  endpoint: string;
  /** 업로드 응답에서 새 URL을 꺼낼 키. */
  column: "cover_image_url" | "detail_image_url";
  /** 안내 문구의 이름. 예: "표지" */
  noun: string;
  initialUrl: string | null;
  previewClassName?: string;
  onChange?: (url: string | null) => void;
}

/** 책 이미지 하나를 올리고 바꾸고 지우는 칸. 저장 버튼과 상관없이 바로 반영됩니다. */
function ImageUploadField({
  label,
  hint,
  endpoint,
  column,
  noun,
  initialUrl,
  previewClassName,
  onChange,
}: ImageUploadFieldProps) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError("JPEG, PNG, WebP 이미지만 올릴 수 있어요.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("이미지는 5MB 이하만 올릴 수 있어요.");
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `${noun}를 올리지 못했어요.`);
      }
      const json = await res.json();
      setUrl(json.data[column]);
      onChange?.(json.data[column]);
    } catch (err) {
      setError(err instanceof Error ? err.message : `${noun}를 올리지 못했어요.`);
    } finally {
      setUploading(false);
    }
  }, [endpoint, column, noun, onChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleRemove = async () => {
    if (!confirm(`${noun}를 삭제할까요?`)) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      setUrl("");
      onChange?.(null);
    } catch {
      setError(`${noun}를 삭제하지 못했어요.`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-primary">{label}</label>
      {hint && <p className="-mt-1 mb-2 text-xs text-muted">{hint}</p>}
      <div className="relative">
        {url ? (
          <div className="group relative w-full overflow-hidden rounded-lg border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={label}
              className={cn("h-48 w-full object-cover", previewClassName)}
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
                onClick={handleRemove}
                className="hidden rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-surface group-hover:flex"
              >
                삭제
              </button>
            </div>
            {uploading && (
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
              uploading && "pointer-events-none opacity-60",
            )}
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted" />
            ) : (
              <>
                <ImageIcon className="h-8 w-8 text-muted" />
                <div className="text-center">
                  <p className="text-sm font-medium text-muted">{noun} 올리기</p>
                  <p className="text-xs text-muted">JPEG, PNG, WebP · 최대 5MB</p>
                  <p className="text-xs text-muted">끌어다 놓거나 눌러서 고르세요</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
