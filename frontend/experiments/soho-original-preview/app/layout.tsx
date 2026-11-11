import type { Metadata } from "next"
import { DM_Sans, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils";

const fontSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" })

const siteTitle = "Soho - Next.js Chat App Template"
const siteDescription =
  "Soho is a chat app template built with Next.js, shadcn/ui and Tailwind CSS. A full messaging UI with group chats, voice messages, status stories, contacts and video calls."

export const metadata: Metadata = {
  metadataBase: new URL("https://soho.shadcnuikit.com"),
  title: {
    default: siteTitle,
    template: "%s | Soho",
  },
  description: siteDescription,
  keywords: [
    "chat app template",
    "Next.js chat template",
    "shadcn/ui template",
    "messaging UI",
    "React chat UI",
    "Tailwind CSS template",
  ],
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    type: "website",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-image.png"],
  },
}

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", fontSans.variable)}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
