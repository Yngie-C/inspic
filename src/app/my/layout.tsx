"use client";

import { SideNavLayout } from "@/components/layout/SideNavLayout";
import { Library, PenLine, ShoppingBag, Settings } from "lucide-react";

const NAV_ITEMS = [
  { href: "/my/library", label: "내 서재", icon: Library },
  { href: "/my/workbook", label: "내 워크북", icon: PenLine },
  { href: "/my/purchases", label: "구매 내역", icon: ShoppingBag },
  { href: "/my/settings", label: "설정", icon: Settings },
];

export default function MyLayout({ children }: { children: React.ReactNode }) {
  return <SideNavLayout navItems={NAV_ITEMS}>{children}</SideNavLayout>;
}
