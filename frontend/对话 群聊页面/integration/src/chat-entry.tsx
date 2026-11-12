import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Info, LogIn, MessageCircle, Paperclip, Pause, Play, Plus, Search, Send, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ChatThemeProvider, ChatThemeToggle } from "./theme";

type Links = Readonly<{ home: string; login: string }>;

function Shell({ links, deepLink }: { links: Links; deepLink: boolean }) {
  const [paused, setPaused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(deepLink);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => { root.dataset.chatHidden = String(document.hidden); };
    root.dataset.chatMotion = paused ? "paused" : "playing";
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      delete root.dataset.chatMotion;
      delete root.dataset.chatHidden;
    };
  }, [paused]);

  return <div className="conversation-page chat-integration-page" data-state="shell" data-motion={paused ? "paused" : "playing"}>
    <div className="chat-atmosphere" aria-hidden="true"><div className="atmosphere-wash"><span className="atmosphere-violet" /><span className="atmosphere-lime" /></div><div className="atmosphere-rings"><i /><i /><i /></div><div className="atmosphere-specks" /></div>
    <a className="skip-link" href="#conversation-main">跳到聊天页面</a>
    <header className="app-header">
      <a className="brand-link" href={links.home} aria-label="返回同频首页"><Brand /></a>
      <span className="header-note">一个人的灵感，一群人的作品</span>
      <div className="header-actions">
        <span className="preview-label"><span />接入中</span>
        <ChatThemeToggle />
        <button type="button" className="icon-button motion-button" aria-label={paused ? "播放背景动效" : "暂停背景动效"} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>
        <a className="home-link" href={links.home}>回到首页<ArrowUpRight aria-hidden="true" /></a>
      </div>
    </header>
    <main id="conversation-main" className="conversation-shell" tabIndex={-1} data-chat-open={mobileOpen}>
      <nav className="navigation-rail" aria-label="聊天页面导航">
        <span className="rail-spark" aria-hidden="true"><Sparkles /></span>
        <button type="button" className="rail-item" aria-pressed={!mobileOpen} onClick={() => setMobileOpen(false)}><MessageCircle aria-hidden="true" /><span>消息</span></button>
        <button type="button" className="rail-item" disabled aria-label="群聊，尚未开放"><Users aria-hidden="true" /><span>群聊</span></button>
        <button type="button" className="rail-item" aria-pressed={mobileOpen} onClick={() => setMobileOpen(true)}><Info aria-hidden="true" /><span>说明</span></button>
        <div className="rail-bottom"><a className="rail-item" href={links.login}><LogIn aria-hidden="true" /><span>登录入口</span></a></div>
      </nav>
      <aside className="conversation-list" aria-label="会话区域，尚未读取">
        <div className="list-heading"><div><div className="eyebrow">好想法，从聊聊开始</div><h1>消息</h1></div><button type="button" className="icon-button new-button" disabled aria-label="新建会话，尚未开放"><Plus aria-hidden="true" /></button></div>
        <label className="chat-search"><Search aria-hidden="true" /><Input disabled aria-label="搜索会话，尚未开放" placeholder="会话搜索尚未开放" /></label>
        <div className="filter-tabs" role="group" aria-label="会话分类，尚未开放">{["全部", "私聊", "群聊", "未读"].map((label) => <button type="button" key={label} disabled>{label}</button>)}</div>
        <div className="list-section-label"><span />服务接入中</div>
        <ScrollArea className="chat-shell-list-scroll">
          <div className="chat-shell-list-note">
            <span className="chat-shell-mark" aria-hidden="true"><MessageCircle /></span>
            <h2>会话尚未读取</h2>
            <p>聊天正在接入。此处暂不显示联系人、会话或未读数量。</p>
            <Button variant="outline" className="chat-shell-details-button" onClick={() => setMobileOpen(true)}>查看接入说明<ArrowUpRight aria-hidden="true" /></Button>
          </div>
        </ScrollArea>
        <p className="chat-shell-sidebar-foot"><ShieldCheck aria-hidden="true" />原有会话与消息继续由系统保存</p>
      </aside>
      <section className="active-conversation chat-shell-content" aria-labelledby="chat-shell-title">
        <header className="thread-header">
          <button type="button" className="icon-button back-button" aria-label="返回会话区域" onClick={() => setMobileOpen(false)}><ArrowLeft aria-hidden="true" /></button>
          <span className="group-avatar chat-shell-header-icon" aria-hidden="true"><MessageCircle /></span>
          <div className="thread-heading"><h2>聊天暂未开放</h2><p>正在连接现有系统</p></div>
          <span className="chat-shell-stage-label">接入中</span>
        </header>
        <ScrollArea className="messages-scroll chat-shell-main-scroll">
          <Empty className="chat-shell-status">
            <EmptyHeader>
              <EmptyMedia className="chat-shell-status-icon"><MessageCircle aria-hidden="true" /></EmptyMedia>
              <EmptyTitle><h1 id="chat-shell-title">让对话，从这里继续</h1></EmptyTitle>
              <EmptyDescription className="chat-shell-description">聊天接入中，尚未读取会话。私聊、群聊和好友申请将在服务接通后开放。</EmptyDescription>
            </EmptyHeader>
            <div className="chat-shell-status-note"><ShieldCheck aria-hidden="true" /><p>这个页面目前不会读取或发送消息，也不会改变群成员。原有聊天数据保持原样。</p></div>
            {deepLink && <p className="chat-shell-deep-link">已保留此页面的位置；尚未验证或读取对应会话。</p>}
            <div className="chat-shell-links"><a className="chat-shell-primary-link" href={links.home}>返回首页<ArrowUpRight aria-hidden="true" /></a><a className="chat-shell-secondary-link" href={links.login}>前往登录入口<LogIn aria-hidden="true" /></a></div>
          </Empty>
        </ScrollArea>
        <div className="composer-area chat-shell-composer">
          <div className="message-composer" aria-describedby="chat-composer-notice"><label className="sr-only" htmlFor="chat-shell-draft">消息输入，尚未开放</label><textarea id="chat-shell-draft" rows={2} disabled placeholder="聊天服务接通后，即可开始对话" /><div className="composer-toolbar"><button type="button" className="icon-button" disabled aria-label="添加附件，尚未开放"><Paperclip aria-hidden="true" /></button><span className="keyboard-hint">发送尚未开放</span><Button className="send-button" disabled>发送<Send aria-hidden="true" /></Button></div></div>
          <p className="demo-footnote" id="chat-composer-notice">尚未读取会话 · 发送与附件暂不可用</p>
        </div>
      </section>
    </main>
    <p className="page-caption"><span>同频，让相遇有下文。</span><span>在这里，好好说话，一起做事。<Sparkles aria-hidden="true" /></span></p>
  </div>;
}

export function ChatEntry(props: { links: Links; deepLink: boolean }) {
  return <ChatThemeProvider><Shell {...props} /></ChatThemeProvider>;
}

export function BootstrapError() {
  return <div className="chat-bootstrap-error" data-state="unavailable" role="alert"><MessageCircle aria-hidden="true" /><h1>暂时无法打开聊天页面</h1><p>页面信息不完整或已失效，请刷新后重试。尚未读取任何会话。</p><Button onClick={() => location.reload()}>重新加载页面</Button></div>;
}
