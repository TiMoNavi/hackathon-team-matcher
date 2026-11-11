import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "同频 CoLab · 发现你的下一位搭档", description: "路线 3 · 独立 Next.js 前端交互验证，非真实成员数据。" };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="zh-CN"><body>{children}</body></html>; }
