import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "오늘 우산 필요할까?",
  description: "매일 아침 우산 필요 여부를 판단하고 카카오톡 알림을 준비하는 날씨 Agent 홈페이지",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
