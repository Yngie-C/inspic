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
    <header className="sticky top-0 z-40 border-b border-line bg-paper">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="text-[19px] font-extrabold tracking-[-0.03em] text-accent">
          inspic
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/explore"
            className="text-body-sm font-semibold text-muted transition-colors duration-150 ease-out hover:text-primary"
          >
            탐색
          </Link>
          {user && (
            <>
              <Link
                href="/my/purchases"
                className="text-body-sm font-semibold text-muted transition-colors duration-150 ease-out hover:text-primary"
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
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted" strokeWidth={1.75} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="책 검색"
            className="h-9 w-full rounded-md border border-field-line bg-field pl-9 pr-3 text-body-sm text-primary placeholder:text-muted"
          />
        </form>

        {/* Desktop Auth */}
        <div className="hidden items-center gap-3 md:flex">
          {/* [SUN-68] 시리즈 기능 — 추후 활성화 */}
          {/* {user && <NotificationBell />} */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 text-body-sm font-semibold text-primary transition-colors duration-150 ease-out hover:bg-mark">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-caption font-bold text-chiffon">
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
                  <Link href="/my/settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" strokeWidth={1.75} />
                    설정
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="flex items-center gap-2 text-danger"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.75} />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/auth/login">로그인</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/auth/signup">회원가입</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-1 md:hidden">
          <button
            className="rounded-md p-2 text-primary hover:bg-mark"
            onClick={() => { setSearchOpen(!searchOpen); setMobileOpen(false); }}
            aria-label="검색 열기"
          >
            {searchOpen ? <X className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Search className="h-[18px] w-[18px]" strokeWidth={1.75} />}
          </button>
          <button
            className="rounded-md p-2 text-primary hover:bg-mark"
            onClick={() => { setMobileOpen(!mobileOpen); setSearchOpen(false); }}
            aria-label="메뉴 열기"
          >
            {mobileOpen ? <X className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Menu className="h-[18px] w-[18px]" strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      {/* Mobile Search Bar */}
      {searchOpen && (
        <div className="border-t border-line bg-paper px-4 py-3 md:hidden">
          <form onSubmit={handleSearch} className="flex items-center relative">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted" strokeWidth={1.75} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="책 검색"
              autoFocus
              className="h-10 w-full rounded-md border border-field-line bg-field pl-9 pr-3 text-body text-primary placeholder:text-muted"
            />
          </form>
        </div>
      )}

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="border-t border-line bg-paper px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            <Link
              href="/explore"
              className="flex items-center gap-2 rounded-sm px-3 py-2 text-body-sm text-primary hover:bg-mark"
              onClick={() => setMobileOpen(false)}
            >
              탐색
            </Link>
            {user ? (
              <>
                <Link
                  href="/my/purchases"
                  className="flex items-center gap-2 rounded-sm px-3 py-2 text-body-sm text-primary hover:bg-mark"
                  onClick={() => setMobileOpen(false)}
                >
                  내 서재
                </Link>
                <Link
                  href="/my/settings"
                  className="flex items-center gap-2 rounded-sm px-3 py-2 text-body-sm text-primary hover:bg-mark"
                  onClick={() => setMobileOpen(false)}
                >
                  <Settings className="h-4 w-4" strokeWidth={1.75} />
                  설정
                </Link>
                <button
                  onClick={() => { setMobileOpen(false); handleSignOut(); }}
                  className="flex items-center gap-2 rounded-sm px-3 py-2 text-body-sm text-danger hover:bg-mark"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.75} />
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="rounded-sm px-3 py-2 text-body-sm text-primary hover:bg-mark"
                  onClick={() => setMobileOpen(false)}
                >
                  로그인
                </Link>
                <Link
                  href="/auth/signup"
                  className="mt-1 rounded-md bg-accent px-3 py-2 text-center text-button text-on-accent hover:bg-accent-hover"
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
