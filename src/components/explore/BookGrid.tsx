"use client";

import { motion } from "framer-motion";
import { BookPreviewCard } from "@/components/explore/BookPreviewCard";
import type { Book } from "@/types";

interface BookWithAuthor extends Book {
  author_name?: string | null;
}

interface BookGridProps {
  books: BookWithAuthor[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.0, 0.0, 0.2, 1.0] as const },
  },
};

export function BookGrid({ books }: BookGridProps) {
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 rounded-full bg-mark p-6">
          <svg
            className="h-10 w-10 text-line-strong"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
        <p className="text-lg font-medium text-gray-700">
          아직 공개된 콘텐츠가 없습니다
        </p>
        <p className="mt-1 text-sm text-gray-400">
          첫 번째 콘텐츠를 발행해 보세요!
        </p>
      </div>
    );
  }

  return (
    <motion.div
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {books.map((book) => (
        <motion.div key={book.id} variants={itemVariants}>
          <BookPreviewCard book={book} />
        </motion.div>
      ))}
    </motion.div>
  );
}
