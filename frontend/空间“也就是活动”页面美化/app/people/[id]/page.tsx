import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, CalendarDays, MessageCircle, Radio, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { event, getPerson, people, self, initialPosts } from '@/lib/event-data';

export function generateStaticParams() { return [...people, self].map(person => ({ id: String(person.id) })); }

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = getPerson(Number(id));
  if (!person || String(person.id) !== id) notFound();
  const posts = initialPosts.filter(post => post.authorId === person.id);
  return <div className="event-app member-page">
    <header className="site-header"><Link href="/" className="brand"><span className="brand-icon"><Radio size={23} /></span><strong>同频</strong><span className="brand-en">Team Matcher</span></Link><Link href="/#forum" className="profile-back"><ArrowLeft size={16} />返回活动</Link></header>
    <main className="member-page-main page-width">
      <p className="profile-eyebrow">THE PEOPLE BEHIND THE IDEAS<span>演示个人主页</span></p>
      <div className="member-page-grid">
        {/* Shadcn UI Kit card9 cover, overlapping avatar and profile body. */}
        <Card className="profile-identity gap-0 overflow-hidden py-0 shadow-none ring-0">
          <CardContent className="profile-cover relative overflow-hidden px-0"><span>LET’S<br />MAKE<br />SOMETHING.</span><ArrowUpRight size={120} strokeWidth={1.2} /><Sparkles size={32} /></CardContent>
          <CardContent className="profile-identity-body relative flex flex-col gap-4 pt-4 pb-6">
            <Image className="profile-large-avatar" src={'/avatars/avatar-' + person.avatar + '.jpg'} width={96} height={96} alt={person.name + '的头像'} />
            <span className="profile-role">{person.role}</span><h1>{person.name}</h1><p>{person.intro}</p>
            {person.skills.length > 0 && <div className="member-skills">{person.skills.map(skill => <span key={skill}>{skill}</span>)}</div>}
            <p className="profile-identity-note">从一场活动，认识一个有趣的人。</p>
          </CardContent>
        </Card>
        <div className="profile-story">
          <section className="profile-intention"><span className="section-kicker"><Sparkles size={15} />这次想一起做</span><h2>{person.looking}</h2><div><span>相遇于</span><Link href="/">{event.name}<ArrowUpRight size={15} /></Link></div></section>
          <section className="profile-activity"><div className="section-title-row"><div><span className="section-kicker">从想法里，认识彼此</span><h2>在这场活动里<span className="heading-dot">.</span></h2></div><MessageCircle size={23} /></div>
            {posts.length ? posts.map(post => <article className="profile-post" key={post.id}><div><span className={'topic-tag topic-' + post.category}>{post.category}</span><time>{post.time}</time></div><p>{post.message}</p></article>) : <p className="profile-no-posts">还没有发布演示帖子，可以先从活动中的交流认识彼此。</p>}
            <p className="profile-scope-note">这里展示本场活动的初始演示内容，不包含其他活动或当前窗口临时发布的帖子。</p>
          </section>
          <div className="profile-event-link"><CalendarDays size={25} /><div><strong>{event.name}</strong><span>{event.date} · {event.place}</span></div><Button asChild variant="outline"><Link href="/#forum">去活动聊聊<ArrowUpRight size={15} /></Link></Button></div>
        </div>
      </div>
      <p className="profile-page-note">独立活动预览 · 人物与资料均为虚构演示；正式个人主页需接入服务端授权后的资料。</p>
    </main>
  </div>;
}
