import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import "./globals.css";
import "./discovery.css";
import "./discovery-v2.css";
import "./discovery-v3.css";

const body = localFont({ src: "./fonts/inter-latin.woff2", variable: "--font-body", weight: "400 700", display: "swap" });
const display = localFont({ src: "./fonts/bricolage-grotesque-latin.woff2", variable: "--font-display", weight: "500 700", display: "swap" });
export const metadata: Metadata = { title: "慢慢展开，遇见同频｜推荐交互原型", description: "从人物卡片长出的推荐详情。当前活动内的独立交互演示。" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN" className={body.variable + " " + display.variable}><body><Providers>{children}</Providers></body></html>;
}
