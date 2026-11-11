import type { Metadata } from "next";
import localFont from "next/font/local";
import { MotionPreferenceProvider } from "@/components/motion-preference";
import "./globals.css";
import "./profile.css";
const body = localFont({ src: "./fonts/inter-latin.woff2", variable: "--font-body", weight: "400 700", display: "swap" });
const display = localFont({ src: "./fonts/bricolage-grotesque-latin.woff2", variable: "--font-display", weight: "500 700", display: "swap" });
export const metadata: Metadata = { title: "林知夏 · 同频个人主页", description: "从资料片段认识知夏，查看能力、项目、本次投入与合作参考。独立个人主页设计原型，内容均为演示。", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="zh-CN" className={`${body.variable} ${display.variable}`}><body><MotionPreferenceProvider>{children}</MotionPreferenceProvider></body></html>; }
