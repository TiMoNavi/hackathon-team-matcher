import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import "./globals.css";
import "./refinements.css";
import "./presentation.css";
import "./navigation.css";

// Exact Google font binaries from the original Signalry preview cache.
const body = localFont({ src: "./fonts/inter-latin.woff2", variable: "--font-body", weight: "400 700", display: "swap" });
const display = localFont({ src: "./fonts/bricolage-grotesque-latin.woff2", variable: "--font-display", weight: "500 700", display: "swap" });

export const metadata: Metadata = {
  title: "同频 Team Matcher｜你的下一个队友，也在找你",
  description:
    "在同一场黑客松与开发者活动中，找到技能互补、方向合拍的队友。用 AI 整理个人画像、读懂推荐理由，从一句打招呼开始，把想法一起做出来。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${body.variable} ${display.variable} antialiased`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
