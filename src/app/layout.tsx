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
    "바로 써먹는 지식을 짧게 읽는 워크북. 읽다가 체크리스트와 질문에 답하면 그 답이 계정에 남아요.",
  keywords: ["워크북", "실용서", "전자책", "체크리스트", "ebook"],
  openGraph: {
    title: "inspic",
    description: "바로 써먹는 지식을 짧게 읽는 워크북. 읽다가 체크리스트와 질문에 답하면 그 답이 계정에 남아요.",
    type: "website",
    siteName: "inspic",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "inspic",
    description: "바로 써먹는 지식을 짧게 읽는 워크북. 읽다가 체크리스트와 질문에 답하면 그 답이 계정에 남아요.",
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
