import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-secondary",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Career Bridge - Career Counseling Platform",
  description: "Web-based application for career counselors and clients, providing AI-driven career profiling and roadmap services.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
        style={
          {
            // Lovable 스타일: Inter를 기본 본문 폰트로 사용
            "--font-primary": "var(--font-secondary)",
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
