import { BookPreviewCard, type BookWithAuthor } from "@/components/explore/BookPreviewCard";

interface BookGridProps {
  books: BookWithAuthor[];
}

/** 탐색 그리드: 데스크톱 3열(gap 24), 모바일 2열(gap 16). 진입 애니메이션은 없다. */
export function BookGrid({ books }: BookGridProps) {
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-24 text-center">
        <p className="text-subtitle text-primary">아직 공개된 책이 없습니다</p>
        <p className="text-body-sm text-muted">
          저자가 책을 발행하면 여기에 보입니다.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 min-[601px]:grid-cols-3 min-[601px]:gap-6">
      {books.map((book) => (
        <BookPreviewCard key={book.id} book={book} />
      ))}
    </div>
  );
}
