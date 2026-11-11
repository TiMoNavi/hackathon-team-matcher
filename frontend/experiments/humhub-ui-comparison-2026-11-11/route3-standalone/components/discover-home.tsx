"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Bell, Check, ChevronDown, CircleHelp, Compass, LayoutGrid, Lightbulb, MapPin, MessageCircle, Plus, Search, Sparkles, Users, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProgressTracker } from "@/components/affectui/progress-tracker";
import data from "@/data/demo-data.json";

type Member = (typeof data.members)[number];
const roles = ["全部", "前端", "后端", "设计", "产品"];
const navItems = [{ label: "发现", icon: Compass }, { label: "广场", icon: LayoutGrid }, { label: "消息", icon: MessageCircle }, { label: "个人", icon: Users }];
const progressSteps = [{ id: "profile", label: "完善我的资料", done: true }, { id: "hello", label: "认识一位新搭档" }, { id: "idea", label: "找到感兴趣的想法" }];

function Brand() {
  return <a href="#discover" className="brand" aria-label="同频 CoLab 首页"><span className="brand-symbol"><i /><i /><i /></span><span>同频 <small>CoLab</small></span></a>;
}

function OrbitArtwork() {
  return <div className="orbit-art" aria-hidden="true">
    <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-ring ring-three" />
    <div className="orbit-center"><Sparkles size={33} strokeWidth={1.4} /></div>
    <div className="orbit-person person-one mint">林<span>React</span></div>
    <div className="orbit-person person-two peach">许<span>Design</span></div>
    <div className="orbit-person person-three blue">陈<span>Build</span></div>
    <span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" />
    <div className="orbit-caption"><span />好点子，就差一个你</div>
  </div>;
}

export default function DiscoverHome() {
  const [role, setRole] = useState("全部");
  const [search, setSearch] = useState("");
  const [followed, setFollowed] = useState<string[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);
  const [toast, setToast] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const members = data.members.filter(member => (role === "全部" || member.role === role) && [member.name, ...member.skills].join(" " ).toLowerCase().includes(search.toLowerCase().trim()));

  useEffect(() => {
    if (selected && !dialogRef.current?.open) dialogRef.current?.showModal();
    if (!selected && dialogRef.current?.open) dialogRef.current?.close();
  }, [selected]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function notify(message = "这是交互演示，操作只保存在当前页面。") {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3600);
  }
  function follow(member: Member) {
    const exists = followed.includes(member.id);
    setFollowed(current => exists ? current.filter(id => id !== member.id) : [...current, member.id]);
    notify(exists ? "已取消演示关注。" : "已关注 " + member.name + "，仅在当前演示页面生效。");
  }
  function nav(label: string) {
    if (label === "发现") document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" });
    else notify(label + "入口已预留，本次只验证发现首页。");
  }

  return <div className="app-shell" id="discover">
    <aside className="sidebar">
      <Brand />
      <div className="workspace-label">一起，把想法做出来</div>
      <nav className="primary-nav" aria-label="主导航">{navItems.map(({ label, icon: Icon }) => <button key={label} className={label === "发现" ? "nav-item active" : "nav-item"} onClick={() => nav(label)} aria-current={label === "发现" ? "page" : undefined}><Icon size={20} /><span>{label}</span>{label === "发现" && <span className="nav-indicator" />}</button>)}</nav>
      <div className="sidebar-event"><span className="eyebrow">当前活动</span><div className="sidebar-event-title"><span className="mini-event-icon"><Sparkles size={16} /></span><span>AI 创造者周末</span></div><p><span className="status-dot" />组队进行中</p></div>
      <div className="sidebar-bottom"><div className="sidebar-note"><Lightbulb size={22} /><p>一个人走得快，<br />一群人走得更有趣。</p><span>MAKE SOMETHING GOOD.</span></div><button className="help-button" onClick={() => notify("先筛选角色，再点开卡片，认识你的潜在搭档。")}><CircleHelp size={18} />需要一点帮助？</button><button className="self-profile" onClick={() => nav("个人")}><span className="self-avatar">我</span><span><b>新朋友</b><small>开始你的创造之旅</small></span><ChevronDown size={15} /></button></div>
    </aside>

    <div className="page-shell">
      <header className="topbar"><div className="mobile-brand"><Brand /></div><div className="breadcrumb">你的社区 <span>/</span> <b>发现</b></div><div className="topbar-actions"><span className="demo-label"><span />交互演示 · 非真实成员数据</span><button className="icon-button" aria-label="通知" onClick={() => notify("你暂时没有新通知。")}><Bell size={19} /></button><span className="top-avatar">我</span></div></header>
      <main>
        <section className="hero" aria-labelledby="hero-title"><div className="hero-copy"><div className="event-chip"><span className="status-dot" />{data.event.name}<span className="chip-divider" />{data.event.phase}</div><p className="hero-kicker">GREAT THINGS START WITH A HELLO.</p><h1 id="hero-title">找到与你<span>同频</span>的队友<span className="heading-dot">。</span></h1><p className="hero-subtitle">{data.subtitle}</p><div className="hero-actions"><a className="button-primary" href="#members">认识新搭档<ArrowDown size={16} /></a><span className="hero-social-proof"><span className="avatar-stack"><i className="mint">林</i><i className="peach">许</i><i className="blue">陈</i></span><span><b>32 位创造者</b><br />等一次同频的相遇</span></span></div></div><OrbitArtwork /></section>
        <section className="stats-bar" aria-label="活动概览"><div><span className="stat-icon mint"><Users size={21} /></span><p><strong>{data.event.participants}<small>位</small></strong><span>在这里的创造者</span></p></div><div><span className="stat-icon peach"><Lightbulb size={21} /></span><p><strong>{data.event.ideas}<small>个</small></strong><span>等待伙伴的好想法</span></p></div><div><span className="stat-icon blue"><Sparkles size={21} /></span><p><strong>{data.event.teams}<small>支</small></strong><span>正在成形的小队</span></p></div><span className="stats-location"><MapPin size={15} />{data.event.city}</span></section>
        <div className="content-grid"><div className="main-column">
          <section className="member-section" id="members" aria-labelledby="members-title"><div className="section-heading"><div><p className="eyebrow">FIND YOUR PEOPLE</p><h2 id="members-title">这些人，可能很合拍<span className="heading-spark">✦</span></h2></div><span className="section-count">同一活动 · {members.length} 位伙伴</span></div>
            <div className="filter-toolbar"><div className="role-filters" aria-label="按角色筛选">{roles.map(item => <button type="button" key={item} data-role-filter={item} aria-pressed={role === item} className={role === item ? "filter active" : "filter"} onClick={() => setRole(item)}>{item}</button>)}</div><label className="search-field"><Search size={16} /><input data-testid="member-search" aria-label="搜索姓名或技能" placeholder="搜索姓名、技能" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
            <div className="member-grid">{members.map(member => <Card key={member.id} className="member-card" data-testid="member-card" data-member-id={member.id}><div className="member-top"><span className={"member-avatar " + member.color}>{member.initial}<span /></span><div className="member-heading"><h3>{member.name}<span>{member.role}</span></h3><p><span className="status-dot" />{member.availability}</p></div><span className="match-label"><Sparkles size={12} />{member.match}%<small>同频度</small></span></div><p className="member-headline">{member.headline}</p><div className="skill-tags">{member.skills.map(skill => <span key={skill}>{skill}</span>)}</div><div className="member-footer"><button data-testid={"member-details-" + member.id} onClick={() => setSelected(member)} className="detail-button">认识一下<ArrowRight size={15} /></button><button data-testid={"member-follow-" + member.id} className={followed.includes(member.id) ? "follow-button followed" : "follow-button"} aria-pressed={followed.includes(member.id)} onClick={() => follow(member)}>{followed.includes(member.id) ? <Check size={14} /> : <Plus size={14} />}{followed.includes(member.id) ? "已关注" : "关注"}</button></div></Card>)}</div>
            {members.length === 0 && <div className="empty-state"><Search size={26} /><h3>还没有找到合适的伙伴</h3><p>换一个技能关键词，或试试其他角色。</p><button onClick={() => {setRole("全部");setSearch("");}}>清除筛选</button></div>}
          </section>
          <section className="ideas-section" aria-labelledby="ideas-title"><div className="section-heading"><div><p className="eyebrow">A LITTLE SPARK, A BIG POSSIBILITY</p><h2 id="ideas-title">好想法，正在找你</h2></div><button className="text-button" onClick={() => nav("广场")}>去广场<ArrowRight size={15} /></button></div><div className="ideas-grid">{data.ideas.map((idea, index) => <Card className={"idea-card " + (index === 0 ? "idea-warm" : "idea-green")} key={idea.title}><div className="idea-top"><span className="idea-icon">{index === 0 ? <MessageCircle size={20} /> : <Sparkles size={20} />}</span><span className="idea-category">{idea.category}</span><ArrowRight size={17} /></div><h3>{idea.title}</h3><p>{idea.description}</p><div className="idea-footer"><span><span className="status-dot" />{idea.lookingFor}</span><button aria-label={"查看想法：" + idea.title} onClick={() => notify("这个想法来自演示数据，详情将在真实产品中接入。")}><Plus size={16} /></button></div></Card>)}</div></section>
        </div><aside className="right-rail" aria-label="活动信息与个人进度"><Card className="event-card"><div className="event-art"><span className="art-caption">CREATE / CONNECT / COLLABORATE</span><div className="art-shape shape-one" /><div className="art-shape shape-two" /><div className="art-shape shape-three" /><span className="art-star">✳</span><span className="art-weekend">A WEEKEND<br />FOR WHAT IF.</span></div><div className="event-card-body"><div className="event-meta"><span className="status-dot" />正在发生</div><h3>{data.event.name}</h3><p>给灵感一个周末，<br />给自己一群有趣的同行者。</p><div className="event-location"><MapPin size={14} />{data.event.city}</div><button className="event-button" onClick={() => notify("当前正在浏览 AI 创造者周末的演示成员。")}>看看这场活动<ArrowRight size={15} /></button></div></Card><ProgressTracker title="出发前，再近一步" steps={progressSteps} className="journey-progress" onChange={() => notify()} /><p className="rail-quote">“ 最好的作品，<br />往往从一句你好开始。 ”<span>HELLO, FUTURE TEAMMATE.</span></p></aside></div>
        <footer className="page-footer"><span>同频 CoLab · 让相遇，发生一点可能</span><span>路线 3 / 独立 Next.js 前端验证</span></footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="移动端主导航">{navItems.map(({label,icon:Icon}) => <button key={label} onClick={() => nav(label)} className={label === "发现" ? "active" : ""} aria-current={label === "发现" ? "page" : undefined}><Icon size={20} /><span>{label}</span></button>)}</nav>
    <dialog ref={dialogRef} className="member-dialog" onCancel={() => setSelected(null)} onClick={e => {if (e.target === dialogRef.current) setSelected(null);}} aria-labelledby="member-dialog-title">{selected && <div className="dialog-content"><button className="dialog-close icon-button" aria-label="关闭详情" onClick={() => setSelected(null)}><X size={20} /></button><span className={"member-avatar dialog-avatar " + selected.color}>{selected.initial}</span><span className="dialog-eyebrow">一位可能同频的伙伴</span><h2 id="member-dialog-title">{selected.name}<small>{selected.role}</small></h2><p className="dialog-headline">{selected.headline}</p><div className="skill-tags">{selected.skills.map(skill => <span key={skill}>{skill}</span>)}</div><div className="dialog-info"><p><span>当前活动</span><strong>{data.event.name}</strong></p><p><span>参与状态</span><strong>{selected.availability}</strong></p><p><span>演示同频度</span><strong>{selected.match}%</strong></p></div><button className="button-primary dialog-follow" onClick={() => follow(selected)}>{followed.includes(selected.id) ? <Check size={17} /> : <Plus size={17} />}{followed.includes(selected.id) ? "已关注" : "关注这位伙伴"}</button><p className="dialog-disclaimer">交互演示 · 非真实成员数据</p></div>}</dialog>
    <div className={toast ? "toast visible" : "toast"} role="status" aria-live="polite">{toast && <><Check size={17} /><span>{toast}</span></>}</div>
  </div>;
}
