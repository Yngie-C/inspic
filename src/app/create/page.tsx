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
      setError("제목을 입력해 주세요.");
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
        throw new Error(json.error ?? "책을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.");
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
            title: "새 장",
            content_html: "",
            content_raw: "",
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
      setError(err instanceof Error ? err.message : "책을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary">새 책 만들기</h1>
          <p className="mt-2 text-muted">
            제목과 가격만 정하면 바로 쓸 수 있어요. 둘 다 나중에 바꿀 수 있어요.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface p-8">
          <div className="flex flex-col gap-5">
            {error && (
              <div className="rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            <Input
              label="제목 *"
              type="text"
              placeholder="예: 30일 지출 점검 워크북"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary">
                설명 (선택)
              </label>
              <textarea
                placeholder="이 책을 읽고 독자가 할 수 있게 되는 일을 한두 줄로 적어 주세요"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-primary placeholder:text-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>


            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary">
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
                  className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 pr-10 text-sm text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                  원
                </span>
              </div>
              <p className="text-xs text-muted">
                {price === 0
                  ? "무료 책이에요"
                  : `판매 가격: ${price.toLocaleString("ko-KR")}원`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4">
              <Button
                onClick={handleDirectWrite}
                isLoading={isCreating}
                disabled={isCreating}
                size="lg"
                className="flex items-center justify-center gap-2"
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
