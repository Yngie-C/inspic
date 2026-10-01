"use client";

import { SideNavLayout } from "@/components/layout/SideNavLayout";
import { BookOpen, BarChart3 } from "lucide-react";

const NAV_ITEMS = [
  { href: "/creator", label: "내 책", icon: BookOpen },
  { href: "/creator/analytics", label: "분석", icon: BarChart3 },
];

export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  return <SideNavLayout navItems={NAV_ITEMS}>{children}</SideNavLayout>;
}
