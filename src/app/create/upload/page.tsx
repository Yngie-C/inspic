"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Header } from "@/components/layout/Header";

interface DetectedChapter {
  title: string;
  preview: string;
}

interface UploadResponse {
  data?: { book: { id: string }; chapters: DetectedChapter[] };
  error?: string;
}

function UploadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const title = searchParams.get("title") ?? "";
  const description = searchParams.get("description") ?? "";

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [chapters, setChapters] = useState<DetectedChapter[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleFileSelect = (f: File) => {
    setFile(f);
    setChapters([]);
    setBookId(null);
    setError("");
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(10);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("description", description);

      // Simulate progress ticks
      const ticker = setInterval(() => {
        setProgress((p) => Math.min(p + 10, 85));
      }, 400);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(ticker);
      setProgress(100);

      // 플랫폼이 본문 크기 제한 등으로 먼저 거절하면 JSON이 아닌 응답이 옵니다.
      const json = (await res.json().catch(() => null)) as UploadResponse | null;
      if (!res.ok || !json?.data) {
        throw new Error(json?.error ?? "파일을 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      }

      // 라우트는 `{ book, chapters }`를 돌려줍니다. 예전에는 `data.id`를 읽어
      // bookId가 비었고, "확인" 버튼이 안 떠서 다시 올리면 책이 하나 더 생겼어요.
      setBookId(json.data.book.id);
      setChapters(json.data.chapters);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "파일을 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = () => {
    if (bookId) router.push(`/create/edit/${bookId}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary">파일 업로드</h1>
          <p className="mt-2 text-muted">
            &ldquo;{title}&rdquo;의 원고 파일을 올려 주세요. 원고의 제목이나 &lsquo;제1장&rsquo; 같은 표시를 기준으로 장이 나뉘어요.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-8">
          <div className="flex flex-col gap-6">
            <FileDropzone onFileSelect={handleFileSelect} />

            {error && (
              <div className="rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {/* Progress */}
            {uploading && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm text-muted">
                  <span>올리는 중</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Chapter preview */}
            {chapters.length > 0 && (
              <div className="rounded-lg border border-success/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-success" />
                  <span className="font-medium text-success">
                    장 {chapters.length}개를 찾았어요
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5 text-sm text-success">
                  {chapters.slice(0, 5).map((ch, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-medium shrink-0">{i + 1}.</span>
                      <span>
                        {ch.title}
                        {ch.preview && (
                          <span className="ml-1 text-success opacity-70">
                            — {ch.preview.slice(0, 40)}...
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                  {chapters.length > 5 && (
                    <li className="text-success opacity-70">
                      ...외 {chapters.length - 5}개
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => router.back()}>
                이전
              </Button>
              {bookId ? (
                <Button onClick={handleConfirm} size="lg">
                  확인 →
                </Button>
              ) : (
                <Button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  isLoading={uploading}
                  size="lg"
                >
                  업로드
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <UploadContent />
    </Suspense>
  );
}
