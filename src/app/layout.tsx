import type { Metadata } from "next";
// Pretendard dynamic subset: 한글 글리프를 unicode-range 조각(92개)으로 나눠 필요한 것만 받는다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { ToastProvider } from "@/components/ui/toast";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";

export const metadata: Metadata = {
  title: {
    default: "inspic",
    template: "%s | inspic",
  },
  description:
    "읽는 책이 아니라 적용하는 책. 워크시트·체크리스트·성찰 질문을 담은 워크북형 전자책을 만들고, 읽으면서 직접 작성하세요.",
  keywords: ["워크북", "전자책", "워크시트", "출판", "ebook"],
  openGraph: {
    title: "inspic",
    description: "읽는 책이 아니라 적용하는 책 — 인터랙티브 워크북 출판 플랫폼",
    type: "website",
    siteName: "inspic",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "inspic",
    description: "읽는 책이 아니라 적용하는 책 — 인터랙티브 워크북 출판 플랫폼",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <GoogleAnalytics />
        <Providers>
          <ToastProvider>{children}</ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
