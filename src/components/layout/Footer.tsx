import Link from "next/link";
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="text-lg font-extrabold tracking-tight text-accent">inspic</span>

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
            &copy; {year} inspic. All rights reserved.
          </p>
        </div>

        <div className="mt-6 border-t border-line pt-4 text-center text-xs text-muted space-y-1">
          <p>상호: inspic | 대표: [대표자명] | 사업자등록번호: [000-00-00000]</p>
          <p>통신판매업 신고번호: [제0000-서울OO-0000호] | 소재지: [주소]</p>
          <p>고객문의: contact@inspic.kr | 호스팅 서비스: Vercel Inc.</p>
        </div>
      </div>
    </footer>
  );
}
