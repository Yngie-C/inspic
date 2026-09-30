"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Header } from "@/components/layout/Header";

export default function CreatePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [price, setPrice] = useState<number>(0);

  const validate = (): boolean => {
    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return false;
    }
    setError("");
    return true;
  };

  const handleUpload = () => {
    if (!validate()) return;
    const params = new URLSearchParams({ title, description, price: String(price) });
    router.push(`/create/upload?${params.toString()}`);
  };

  const handleDirectWrite = async () => {
    if (!validate()) return;
    setIsCreating(true);
    setError("");

    try {
      const bookRes = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          source_type: "text",
          price,
        }),
      });

      if (!bookRes.ok) {
        const json = await bookRes.json();
        throw new Error(json.error ?? "콘텐츠 생성에 실패했습니다.");
      }

      const bookJson = await bookRes.json();
      const bookId = bookJson.data.id;

      let chapterCreated = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        const chapterRes = await fetch("/api/chapters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            book_id: bookId,
            title: "챕터 1",
            content_html: "",
            content_raw: "",
            order_index: 0,
          }),
        });
        if (chapterRes.ok) {
          chapterCreated = true;
          break;
        }
      }

      if (!chapterCreated) {
        console.warn("챕터 생성 실패 — 에디터에서 수동 추가 가능");
      }

      router.push(`/create/edit/${bookId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">새 콘텐츠 만들기</h1>
          <p className="mt-2 text-gray-500">
            콘텐츠의 기본 정보를 입력하세요.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Input
              label="제목 *"
              type="text"
              placeholder="콘텐츠 제목을 입력하세요"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                설명 (선택)
              </label>
              <textarea
                placeholder="콘텐츠에 대한 간단한 설명을 입력하세요"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20 resize-none"
              />
            </div>


            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                가격 (원)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={price}
                  onChange={(e) => setPrice(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 pr-10 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  원
                </span>
              </div>
              <p className="text-xs text-gray-400">
                {price === 0
                  ? "무료로 공개됩니다"
                  : `판매 가격: ${price.toLocaleString("ko-KR")}원`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4">
              <Button
                onClick={handleDirectWrite}
                isLoading={isCreating}
                disabled={isCreating}
                size="lg"
                className="flex items-center justify-center gap-2 rounded-full"
              >
                <PenLine className="h-4 w-4" />
                직접 작성하기
              </Button>
              <Button
                onClick={handleUpload}
                disabled={isCreating}
                variant="outline"
                size="lg"
                className="flex items-center justify-center gap-2"
              >
                <Upload className="h-4 w-4" />
                파일 업로드하기
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
