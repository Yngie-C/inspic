"use client";

import Link from "next/link";
import { ArrowLeft, Monitor, Tablet, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Viewport = "desktop" | "tablet" | "mobile";

interface Props {
  bookId: string;
  bookTitle: string;
  viewport: Viewport;
  onViewportChange: (vp: Viewport) => void;
}

const viewports: { key: Viewport; icon: typeof Monitor; label: string }[] = [
  { key: "desktop", icon: Monitor, label: "Desktop" },
  { key: "tablet", icon: Tablet, label: "Tablet" },
  { key: "mobile", icon: Smartphone, label: "Mobile" },
];

export function PreviewToolbar({
  bookId,
  bookTitle,
  viewport,
  onViewportChange,
}: Props) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between border-b border-line bg-paper px-4 py-2.5">
      {/* Left: back + title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/create/edit/${bookId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            편집으로
          </Link>
        </Button>
        <span className="hidden text-sm font-medium text-muted sm:block">
          {bookTitle}
        </span>
      </div>

      {/* Right: viewport toggle */}
      <div className="flex items-center gap-1">
        {viewports.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => onViewportChange(key)}
            title={label}
            className={cn(
              "rounded-lg p-2 transition-colors",
              viewport === key
                ? "bg-primary text-on-primary"
                : "text-muted hover:bg-mark hover:text-muted"
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
