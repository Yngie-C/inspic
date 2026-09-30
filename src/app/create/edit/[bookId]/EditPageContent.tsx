"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  GripVertical,
  BookOpen,
  ArrowLeft,
  Check,
  Settings,
  X,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Header } from "@/components/layout/Header";
import { RichTextEditor } from "@/components/editor";
import { BookMetadataForm } from "@/components/dashboard/BookMetadataForm";
import { ExportMenu } from "@/components/dashboard/ExportMenu";
import type { Book, Chapter } from "@/types";

async function fetchBook(id: string): Promise<Book> {
  const res = await fetch(`/api/books/${id}`);
  if (!res.ok) throw new Error("책을 불러오지 못했습니다.");
  const json = await res.json();
  const { chapters: _chapters, ...book } = json.data;
  return book as Book;
}

async function fetchChapters(bookId: string): Promise<Chapter[]> {
  const res = await fetch(`/api/chapters?bookId=${bookId}`);
  if (!res.ok) throw new Error("챕터를 불러오지 못했습니다.");
  return (await res.json()).data ?? [];
}

export function EditPageContent() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: book, isLoading: bookLoading } = useQuery<Book>({
    queryKey: ["book", bookId],
    queryFn: () => fetchBook(bookId),
  });

  const { data: chapters = [], isLoading: chaptersLoading } = useQuery<Chapter[]>({
    queryKey: ["chapters", bookId],
    queryFn: () => fetchChapters(bookId),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saved, setSaved] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (chapters.length > 0 && !selectedId) {
      const first = chapters[0];
      setSelectedId(first.id);
      setEditTitle(first.title);
      setEditContent(first.content_html || first.content_raw || "");
    }
  }, [chapters, selectedId]);

  const selectedChapter = chapters.find((c) => c.id === selectedId);

  const selectChapter = (ch: Chapter) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSelectedId(ch.id);
    setEditTitle(ch.title);
    setEditContent(ch.content_html || ch.content_raw || "");
    setSaved(true);
  };

  const saveChapter = useCallback(
    async (id: string, title: string, contentHtml: string) => {
      await fetch(`/api/chapters/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content_html: contentHtml }),
      });
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["chapters", bookId] });
    },
    [bookId, qc],
  );

  const handleContentChange = (html: string) => {
    setEditContent(html);
    setSaved(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (selectedId) saveChapter(selectedId, editTitle, html);
    }, 3000);
  };

  const handleTitleChange = (val: string) => {
    setEditTitle(val);
    setSaved(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (selectedId) saveChapter(selectedId, val, editContent);
    }, 1500);
  };

  const addChapter = async () => {
    const res = await fetch(`/api/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        book_id: bookId,
        title: `챕터 ${chapters.length + 1}`,
        content_html: "",
        content_raw: "",
        order_index: chapters.length,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      qc.invalidateQueries({ queryKey: ["chapters", bookId] });
      selectChapter(json.data);
    }
  };

  const deleteChapter = async (id: string) => {
    if (!confirm("이 챕터를 삭제하시겠습니까?")) return;
    await fetch(`/api/chapters/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["chapters", bookId] });
    if (selectedId === id) {
      setSelectedId(null);
      setEditTitle("");
      setEditContent("");
    }
  };

  /**
   * 공개는 미리보기 화면에서 합니다.
   *
   * 여기서 바로 출간하면 크리에이터는 독자에게 어떻게 보이는지 한 번도
   * 보지 않은 채로 공개하게 됩니다. 워크북 블록이 응답을 받을 수 없는
   * 상태인지도 그 화면에서만 드러납니다.
   *
   * 저장이 3초 디바운스라 이동 전에 대기 중인 변경을 먼저 밀어 넣습니다.
   */
  const goToReview = async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPublishing(true);
    try {
      if (selectedId && !saved) {
        await saveChapter(selectedId, editTitle, editContent);
      }
      router.push(`/create/preview/${bookId}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleMetaSave = async (updates: Partial<Book>) => {
    const res = await fetch(`/api/books/${bookId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "저장 실패");
    }
    qc.invalidateQueries({ queryKey: ["book", bookId] });
    setMetaOpen(false);
  };

  if (bookLoading || chaptersLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/creator")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            대시보드
          </Button>
          <span className="hidden text-sm font-medium text-gray-700 sm:block">
            {book?.title}
          </span>
          {!saved && <span className="text-xs text-gray-400">저장 중...</span>}
          {saved && selectedId && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3.5 w-3.5" />
              저장됨
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {book && <ExportMenu bookId={bookId} bookTitle={book.title} />}

          <button
            type="button"
            onClick={() => setMetaOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50"
            title="책 설정"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">설정</span>
          </button>

          <Button onClick={goToReview} isLoading={publishing}>
            <Eye className="h-4 w-4 mr-1.5" />
            검수 후 공개
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: chapter list */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-gray-700">
              챕터 ({chapters.length})
            </span>
            <button
              onClick={addChapter}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              title="챕터 추가"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-2">
            {chapters.map((ch) => (
              <div
                key={ch.id}
                onClick={() => selectChapter(ch)}
                className={`group flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                  selectedId === ch.id
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-brand-50/50 hover:text-gray-900"
                }`}
              >
                <GripVertical className="h-4 w-4 shrink-0 opacity-40" />
                <span className="flex-1 truncate">{ch.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChapter(ch.id);
                  }}
                  className={`rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
                    selectedId === ch.id
                      ? "hover:bg-brand-100"
                      : "text-red-500 hover:bg-red-50"
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {chapters.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-gray-400">
                챕터가 없습니다.
                <br />+ 버튼으로 추가하세요.
              </div>
            )}
          </nav>
        </aside>

        {/* Main editor */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {selectedChapter ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-gray-100 bg-white px-8 pt-8 pb-4">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="챕터 제목"
                  className="w-full border-none bg-transparent text-2xl font-bold text-gray-900 outline-none placeholder-gray-300"
                />
              </div>

              <div className="flex flex-1 flex-col overflow-hidden bg-white">
                <RichTextEditor
                  key={selectedChapter.id}
                  content={editContent}
                  onUpdate={handleContentChange}
                  bookId={bookId}
                  chapterId={selectedChapter.id}
                  placeholder="내용을 입력하세요..."
                  className="flex-1 overflow-hidden"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
              <BookOpen className="h-16 w-16 opacity-30" />
              <p className="text-sm">
                왼쪽에서 챕터를 선택하거나 새 챕터를 추가하세요.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Book metadata side panel */}
      <div
        className={`fixed inset-0 z-30 bg-black/20 transition-opacity duration-300 ${
          metaOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMetaOpen(false)}
      />

      <div
        className={`fixed right-0 top-0 z-40 flex h-full w-full max-w-sm flex-col border-l border-gray-200 bg-white shadow-xl transition-transform duration-300 ease-in-out ${
          metaOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
          <h2 className="text-base font-semibold text-gray-900">책 설정</h2>
          <button
            type="button"
            onClick={() => setMetaOpen(false)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {book && <BookMetadataForm book={book} onSave={handleMetaSave} />}
        </div>
      </div>
    </div>
  );
}
