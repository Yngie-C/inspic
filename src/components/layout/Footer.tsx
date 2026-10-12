import Link from "next/link";
import { CONTACT_EMAIL, SERVICE_NAME } from "@/lib/brand";
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="text-lg font-extrabold tracking-tight text-primary">{SERVICE_NAME}</span>

          <nav className="flex gap-6 text-sm text-muted">
            <Link href="/about" className="hover:text-primary transition-colors">
              소개
            </Link>
            <Link href="/faq" className="hover:text-primary transition-colors">
              FAQ
            </Link>
            <Link href="/privacy" className="hover:text-primary transition-colors">
              개인정보처리방침
            </Link>
            <Link href="/terms" className="hover:text-primary transition-colors">
              이용약관
            </Link>
          </nav>

          <p className="text-sm text-muted">
            &copy; {year} {SERVICE_NAME}. All rights reserved.
          </p>
        </div>

        <div className="mt-6 border-t border-line pt-4 text-center text-xs text-muted space-y-1">
          <p>상호: 주식회사 선베이글 | 대표: 문태용 | 사업자등록번호: 659-81-01659</p>
          <p>통신판매업 신고번호: 2026-서울서초-0692 | 소재지: 서울 마포구 큰우물로 76 (고려빌딩) 4층 403호 내 104호(도화동)</p>
          <p>고객문의: {CONTACT_EMAIL} | 호스팅 서비스: Vercel Inc.</p>
        </div>
      </div>
    </footer>
  );
}
