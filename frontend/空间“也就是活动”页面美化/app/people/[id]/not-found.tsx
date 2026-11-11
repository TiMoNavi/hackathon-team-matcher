import Link from 'next/link';
import { ArrowLeft, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PersonNotFound() {
  return <main className="event-app member-page"><div className="access-page"><span className="section-kicker">个人主页</span><UserRound size={32} /><h1>暂时找不到这位伙伴</h1><p>这份独立预览只包含本场活动的演示人物。</p><Button asChild><Link href="/"><ArrowLeft size={16} />返回活动</Link></Button></div></main>;
}
