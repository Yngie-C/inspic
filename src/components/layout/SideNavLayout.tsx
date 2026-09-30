"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface SideNavLayoutProps {
  navItems: NavItem[];
  children: React.ReactNode;
}

export function SideNavLayout({ navItems, children }: SideNavLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Header />
      <div className="flex flex-1">
        <aside className="hidden w-56 flex-shrink-0 border-r border-line bg-mark/50 lg:block">
          <nav className="sticky top-16 p-4">
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">
              메뉴
            </p>
            <ul className="space-y-1">
              {navItems.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || pathname.startsWith(href + "/");
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-mark font-semibold text-primary"
                          : "text-muted hover:bg-mark hover:text-primary",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
