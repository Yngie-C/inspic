import type { Metadata } from "next";
// Pretendard dynamic subset: 한글 글리프를 unicode-range 조각(92개)으로 나눠 필요한 것만 받는다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { ToastProvider } from "@/components/ui/toast";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { SERVICE_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: {
    default: SERVICE_NAME,
    template: `%s | ${SERVICE_NAME}`,
  },
  description:
    "해 본 사람이 쓴 실전 워크북. 현장의 노하우를 읽고, 내 일에 바로 적용해 보세요.",
  keywords: ["실전", "노하우", "워크북", "실용서", "전자책", "ebook"],
  openGraph: {
    title: SERVICE_NAME,
    description: "해 본 사람이 쓴 실전 워크북. 현장의 노하우를 읽고, 내 일에 바로 적용해 보세요.",
    type: "website",
    siteName: SERVICE_NAME,
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: SERVICE_NAME,
    description: "해 본 사람이 쓴 실전 워크북. 현장의 노하우를 읽고, 내 일에 바로 적용해 보세요.",
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
