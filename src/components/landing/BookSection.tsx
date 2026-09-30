"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BookPreviewCard } from "@/components/explore/BookPreviewCard";
import type { Book } from "@/types";

interface BookWithAuthor extends Book {
  author_name?: string | null;
}

interface BookSectionProps {
  title: string;
  moreHref: string;
  books: BookWithAuthor[];
}

export function BookSection({ title, moreHref, books }: BookSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-primary sm:text-2xl">{title}</h2>
        <Link
          href={moreHref}
          className="flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-primary"
        >
          더보기 →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {books.map((b) => (
          <BookPreviewCard key={b.id} book={b} />
        ))}
      </div>
    </motion.section>
  );
}
