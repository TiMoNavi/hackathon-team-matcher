"use client";
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowDown, ArrowUpRight, Menu, Pause, Play, Radio, Sparkles, X, Orbit, MapPin, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog,DialogClose,DialogContent,DialogDescription,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { TiltCard } from '@/components/effects/tilt-card';
import { GridBackground } from '@/components/effects/grid-background';
import { useMotionPreference } from '@/components/motion-preference';
import { FactsField } from '@/components/facts-field';
import { ProfileDetails } from '@/components/profile-details';
import { ViewerInsights } from '@/components/viewer-insights';
import { ProfileWork } from '@/components/profile-work';
import { ConnectionCTA } from '@/components/connection-cta';
import { FriendRequestDraft } from '@/components/effects/friend-request-draft';
import { requestVariants,type Viewer } from '@/lib/request-drafts';
import { identity,visibleEntries,toDetail,type Detail,type Scenario } from '@/lib/profile-data';

type Panel={kind:'request'}|{kind:'detail';detail:Detail};
const navigation=[{id:'about',label:'概览'},{id:'insights',label:'AI 推荐'},{id:'details',label:'资料详情'},{id:'work',label:'想法与项目'}];
export function ProfilePage(){
  const {paused,reduced,toggle}=useMotionPreference();
  const [panel,setPanel]=useState<Panel|null>(null);
  const [activeSection,setActiveSection]=useState('about');
  const [menuOpen,setMenuOpen]=useState(false);
  const [scenario,setScenario]=useState<Scenario>('full');
  const [draft,setDraft]=useState('');
  const [viewer,setViewer]=useState<Viewer>('developer');
  const [saved,setSaved]=useState(false);
  const lastFocus=useRef<HTMLElement|null>(null);
  const sparse=scenario==='sparse';
  const profile=visibleEntries(sparse);
  // Changing the simulated visitor or visibility projection invalidates its draft.
  const changeViewer=(next:Viewer)=>{setViewer(next);setDraft('');setSaved(false);};
  const changeScenario=(next:Scenario)=>{if((next==='sparse')!==sparse){setDraft('');setSaved(false);}setScenario(next);};
  const openPanel=(next:Panel)=>{lastFocus.current=document.activeElement as HTMLElement;setPanel(next);setMenuOpen(false);};
  const openDetail=(detail:Detail)=>openPanel({kind:'detail',detail});
  const greet=(manual=false)=>{if(!draft&&!manual)setDraft(requestVariants(viewer,profile)[0].body);openPanel({kind:'request'});};
  useEffect(()=>{
    const update=()=>{let current='about';for(const item of navigation){const el=document.getElementById(item.id);if(el&&el.getBoundingClientRect().top<=200)current=item.id;}setActiveSection(current);};
    window.addEventListener('scroll',update,{passive:true});return()=>window.removeEventListener('scroll',update);
  },[]);
  return <>
    <a className="skip-link" href="#main">跳到个人主页内容</a>
    <header className="site-header">
      <a href="#about" className="site-brand" aria-label="同频，返回个人主页顶部"><span className="brand-symbol"><Radio size={23}/></span><strong>同频</strong><span className="brand-divider"/><span className="brand-page">个人主页</span></a>
      <nav className="desktop-nav" aria-label="个人主页章节">{navigation.map(item=><a key={item.id} href={'#'+item.id} aria-current={activeSection===item.id?'location':undefined}>{item.label}</a>)}</nav>
      <div className="header-actions"><button className="motion-toggle" onClick={toggle} aria-label={reduced?'系统已减少动态效果':paused?'播放页面动效':'暂停页面动效'} aria-pressed={paused} disabled={reduced}>{paused?<Play size={16}/>:<Pause size={16}/>}</button><Button className="header-contact" onClick={()=>greet()}><Sparkles size={15}/>AI 代写申请</Button><button className="mobile-menu-toggle" aria-label={menuOpen?'关闭导航':'打开导航'} aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X size={21}/>:<Menu size={21}/>}</button></div>
      {menuOpen&&<nav className="mobile-nav" id="mobile-nav" aria-label="手机章节导航" onKeyDown={e=>{if(e.key==='Escape')setMenuOpen(false);}}>{navigation.map(item=><a key={item.id} href={'#'+item.id} onClick={()=>setMenuOpen(false)}>{item.label}<ArrowUpRight size={15}/></a>)}</nav>}
    </header>
    <main id="main">
      <section className="profile-hero" id="about" aria-labelledby="profile-title">
        <div className="hero-atmosphere" aria-hidden="true"><GridBackground className="profile-grid" size={56} speed={0} color="color-mix(in srgb,var(--primary) 6%,transparent)" fade={88} reveal={false}/><div className="hero-glow"/></div>
        <div className="profile-container">
          <div className="hero-breadcrumb"><span>PEOPLE /</span><span>LIN ZHIXIA</span><span className="breadcrumb-end">每个人，都不止一面。<Sparkles size={14}/></span></div>
          <div className="profile-stage">
            <div className="identity-column">
              <TiltCard maxTilt={paused?0:2} scale={1} className="portrait-tilt"><div className="portrait-card">
                {scenario==='no-photo'?<div className="portrait-fallback"><Orbit size={110} strokeWidth={.7}/><span>林</span></div>:<Image src={identity.avatar_ref} alt="虚构人物资料的演示肖像，照片与资料无关" fill sizes="(max-width:767px) 90vw, 390px" priority className="portrait-image"/>}
                <div className="portrait-shade"/>{!sparse&&<span className="portrait-availability"><i/>开放合作</span>}
                <div className="portrait-copy"><span>MEET THE MAKER</span><p>Lin Zhixia<span>.</span></p><span className="portrait-location"><MapPin size={13}/>杭州{!sparse&&' / UTC+8'}</span></div>
                <span className="portrait-mark" aria-hidden="true"><Sparkles size={34} strokeWidth={1}/></span>
              </div></TiltCard>
              <div className="portrait-under"><span className="portrait-line"/><span>一点设计，一点代码。</span><span className="portrait-number">01 / PEOPLE</span></div>
              <div className="person-actions"><Button size="xl" onClick={()=>greet()}><Sparkles size={17}/>AI 代写好友申请<ArrowUpRight size={16}/></Button><a className="profile-details-button" href="#details" aria-label="浏览完整资料"><Layers size={19}/></a></div>
            </div>
            <div className="profile-world">
              <div className="world-heading"><div className="world-title-row"><h1 id="profile-title">{scenario==='long'?'林知夏 · 保持好奇的产品设计师':identity.nickname}<span>.</span></h1><span className="profile-scope">个人主页<span>PROFILE / 2026</span></span></div><p>{identity.headline}<span className="heading-divider"/>概览 · 从几个片段开始认识。</p></div>
              <FactsField key={sparse?'sparse':'full'} onOpen={entry=>openDetail(toDetail(entry))} dialogOpen={panel!==null} sparse={sparse} long={scenario==='long'}/>
            </div>
          </div>
          <div className="hero-bottom"><a href="#insights"><span className="scroll-cue"><ArrowDown size={15}/></span>看看你们，可以一起做什么</a><span>可见资料概览<span>·</span>演示人物</span></div>
        </div>
      </section>
      <div className="body-container">
        <ViewerInsights entries={profile} sparse={sparse} onOpen={entry=>openDetail(toDetail(entry))} onGreet={()=>greet()} viewer={viewer} onViewerChange={changeViewer}/>
        <ProfileDetails entries={profile} sparse={sparse} open={openDetail} onRequest={()=>greet()}/>
        <ProfileWork entries={profile} open={openDetail} sparse={sparse} long={scenario==='long'} noPhoto={scenario==='no-photo'}/>
        <ConnectionCTA onRequest={()=>greet()} onManual={()=>greet(true)} saved={saved} noPhoto={scenario==='no-photo'}/>
      </div>
    </main>
    <footer className="site-footer"><a href="#about" className="footer-brand"><Radio size={20}/>同频<span>让有趣的人，相遇。</span></a><p>独立设计预览 · 人物、资料、关系与 AI 解读均为演示</p><a href="#about" className="back-top">回到顶部<ArrowUpRight size={14}/></a><details className="preview-settings"><summary>预览设置</summary><label htmlFor="scenario">内容状态</label><select id="scenario" value={scenario} onChange={e=>changeScenario(e.target.value as Scenario)}><option value="full">完整资料</option><option value="sparse">少量资料 / 无关系</option><option value="long">长姓名与长条目</option><option value="no-photo">尚未上传照片</option></select><span>仅切换本地示例，刷新重置。</span></details></footer>
    <Dialog open={panel!==null} onOpenChange={open=>{if(!open)setPanel(null);}}><DialogContent className="profile-modal" showCloseButton={false} onEscapeKeyDown={e=>{if(panel?.kind==='request'&&e.target instanceof HTMLTextAreaElement)e.preventDefault();}} onCloseAutoFocus={e=>{e.preventDefault();lastFocus.current?.focus({preventScroll:true});}}><DialogClose asChild><button className="modal-close" aria-label="关闭详情"><X size={20}/></button></DialogClose>
      {panel?.kind==='detail'&&<><DialogHeader><span className="eyebrow">{panel.detail.eyebrow}</span><DialogTitle>{panel.detail.title}</DialogTitle><DialogDescription>林知夏 · 对当前观看者可见的演示内容</DialogDescription></DialogHeader><div className="dialog-scroll detail-reading"><p>{panel.detail.body}</p>{panel.detail.tags&&<div className="tag-list">{panel.detail.tags.map(tag=><span key={tag}>{tag}</span>)}</div>}</div><div className="modal-note"><Sparkles size={14}/>虚构示例{panel.detail.field&&<span>资料字段 · {panel.detail.field}</span>}</div></>}
      {panel?.kind==='request'&&<><DialogHeader><span className="eyebrow">A THOUGHTFUL FIRST HELLO</span><DialogTitle>让第一句，更像你。</DialogTitle><DialogDescription>AI 帮你起草好友申请，你来确认和修改。</DialogDescription></DialogHeader><FriendRequestDraft initialBody={draft} tones={requestVariants(viewer,profile)} onDraftChange={body=>{setDraft(body);setSaved(false);}} onSave={body=>{setDraft(body);setSaved(true);}}/><p className="request-demo-note">本地演示采用预写文案。保存不会发送申请，也不会解锁好友资料。</p></>}
    </DialogContent></Dialog>
  </>;
}
