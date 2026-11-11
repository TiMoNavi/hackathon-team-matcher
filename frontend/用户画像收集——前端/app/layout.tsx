import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "同频 · 认识你的第一步",
  description: "以 AffectUI 为主的用户画像引导关键元素交互预览。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('profile-preview-theme');if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark'}if(localStorage.getItem('profile-preview-motion')==='reduced'){document.documentElement.dataset.motion='reduced'}}catch(e){}" }} />
      </head>
      <body className="onboarding-page">{children}</body>
    </html>
  );
}
