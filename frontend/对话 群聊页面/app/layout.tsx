import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
import "./conversations.css";
import "./themes.css";
import "./friend-requests.css";
import "./polish.css";

const body = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-body",
  weight: "400 700",
  display: "swap",
});
const display = localFont({
  src: "./fonts/bricolage-grotesque-latin.woff2",
  variable: "--font-display",
  weight: "500 700",
  display: "swap",
});
export const metadata: Metadata = {
  title: "消息与群聊｜同频 Team Matcher",
  description: "和同频的人，从一句话开始。私聊与活动讨论的本地界面演示。",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${body.variable} ${display.variable} antialiased`}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
