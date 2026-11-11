import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/components/providers';
import './globals.css';
import './event.css';
import './event-polish.css';
const body=localFont({src:'./fonts/inter-latin.woff2',variable:'--font-body',weight:'400 700',display:'swap'});
const display=localFont({src:'./fonts/bricolage-grotesque-latin.woff2',variable:'--font-display',weight:'500 700',display:'swap'});
export const metadata:Metadata={title:'周末造物场 · 同频 Team Matcher',description:'带上一个想法，遇见一群愿意一起做的人。黑客松活动页独立交互预览。'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN" className={body.variable+' '+display.variable}><body><Providers>{children}</Providers></body></html>}
