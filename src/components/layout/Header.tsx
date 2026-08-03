"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X, LogOut, Settings, Search } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// [SUN-68] 시리즈 기능 — 추후 활성화
// import { NotificationBell } from "@/components/notifications/NotificationBell";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
      setSearchOpen(false);
      setMobileOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="font-logo text-xl font-bold italic text-gray-900">
          inspic
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/explore"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            탐색
          </Link>
          {user && (
            <>
              <Link
                href="/my/purchases"
                className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
              >
                내 서재
              </Link>
            </>
          )}
        </nav>

        {/* Desktop Search Bar */}
        <form
          onSubmit={handleSearch}
          className="hidden md:flex items-center relative w-64 lg:w-80"
        >
          <Search className="absolute left-3 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="콘텐츠 검색..."
            className="w-full rounded-full border border-gray-200 bg-gray-50 pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
          />
        </form>

        {/* Desktop Auth */}
        <div className="hidden items-center gap-3 md:flex">
          {/* [SUN-68] 시리즈 기능 — 추후 활성화 */}
          {/* {user && <NotificationBell />} */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full p-1 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-white text-xs font-bold">
                    {profile?.display_name
                      ? profile.display_name[0].toUpperCase()
                      : user.email?.[0].toUpperCase() ?? "U"}
                  </div>
                  <span className="hidden sm:block">
                    {profile?.display_name ?? user.email?.split("@")[0]}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href="/creator" className="flex items-center gap-2">
                    스튜디오
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    설정
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="flex items-center gap-2 text-red-600 hover:bg-red-50 focus:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="rounded-full" asChild>
                <Link href="/auth/login">로그인</Link>
              </Button>
              <Button size="sm" className="rounded-full" asChild>
                <Link href="/auth/signup">회원가입</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-1 md:hidden">
          <button
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            onClick={() => { setSearchOpen(!searchOpen); setMobileOpen(false); }}
            aria-label="Toggle search"
          >
            {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>
          <button
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            onClick={() => { setMobileOpen(!mobileOpen); setSearchOpen(false); }}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Search Bar */}
      {searchOpen && (
        <div className="border-t border-gray-200 bg-white px-4 py-3 md:hidden">
          <form onSubmit={handleSearch} className="flex items-center relative">
            <Search className="absolute left-3 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="콘텐츠 검색..."
              autoFocus
              className="w-full rounded-full border border-gray-200 bg-gray-50 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
            />
          </form>
        </div>
      )}

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="border-t border-gray-200 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            <Link
              href="/explore"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              onClick={() => setMobileOpen(false)}
            >
              탐색
            </Link>
            {user ? (
              <>
                <Link
                  href="/my/purchases"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  onClick={() => setMobileOpen(false)}
                >
                  내 서재
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  onClick={() => setMobileOpen(false)}
                >
                  <Settings className="h-4 w-4" />
                  설정
                </Link>
                <button
                  onClick={() => { setMobileOpen(false); handleSignOut(); }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  onClick={() => setMobileOpen(false)}
                >
                  로그인
                </Link>
                <Link
                  href="/auth/signup"
                  className="rounded-full bg-gray-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-gray-700"
                  onClick={() => setMobileOpen(false)}
                >
                  회원가입
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
