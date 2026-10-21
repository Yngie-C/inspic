import { AuthorAvatar } from "@/components/ui/author-avatar";
import { BookPreviewCard, type PreviewBook } from "@/components/explore/BookPreviewCard";

/**
 * 저자 페이지의 화면 부분 (DESIGN.md Layout "저자 페이지").
 * 데이터 로딩은 `AuthorClient`가 하고, `/dev/author`는 목 데이터로 이 화면을 그린다.
 */

export interface AuthorProfile {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  about: string | null;
  avatar_url: string | null;
}

export type AuthorBook = PreviewBook & { owner_id: string; published_at: string | null };

export interface AuthorData {
  profile: AuthorProfile;
  books: AuthorBook[];
}

export function AuthorView({ data }: { data: AuthorData }) {
  const { profile, books } = data;
  const name = profile.display_name?.trim() || "이름 없는 저자";

  return (
    <div className="mx-auto flex max-w-[936px] flex-col gap-12 px-4 pb-16 pt-6 min-[601px]:px-6 min-[601px]:pt-12">
      <header className="flex flex-col gap-5">
        <div className="flex items-center gap-5">
          <AuthorAvatar name={name} url={profile.avatar_url} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-title text-primary min-[601px]:text-display">{name}</h1>
            {profile.bio && <p className="text-body text-muted">{profile.bio}</p>}
          </div>
        </div>
        {books.length > 0 && (
          <p className="border-y border-line py-3 text-body-sm text-muted">
            공개한 책 <span className="text-primary">{books.length}권</span>
          </p>
        )}
      </header>

      {/* "해 본 사람"이 무엇을 해 왔는지가 이 저자의 책을 고르는 이유입니다. */}
      {profile.about && (
        <section>
          <h2 className="mb-3.5 text-label text-muted">이력</h2>
          <p className="max-w-[640px] whitespace-pre-line text-body text-primary">
            {profile.about}
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-3.5 text-label text-muted">이 저자의 책</h2>
        {books.length === 0 ? (
          <p className="py-12 text-center text-body-sm text-muted">아직 공개된 책이 없어요.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 min-[601px]:grid-cols-3 min-[601px]:gap-6 min-[901px]:grid-cols-4">
            {books.map((book) => (
              <BookPreviewCard key={book.id} book={book} showSummary />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
