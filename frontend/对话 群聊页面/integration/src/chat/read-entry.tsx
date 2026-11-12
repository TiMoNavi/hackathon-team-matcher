import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowUpRight, Check, ChevronUp, Info, LogIn, MessageCircle, Paperclip, Pause, Play, Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { ChatThemeProvider, ChatThemeToggle } from "../theme";
import type { ReadController } from "./read-controller.js";
import type { ChatApiError } from "./http.js";
import { parseReadPath, readPath } from "./navigation.js";
import { conversationTitle, errorMessage, intersectViewRects, messageAuthor, messagePreview, shortTimestamp, visibleReadSeq } from "./read-presentation.js";
import type { ViewRect } from "./read-presentation.js";

export type ReadLinks = Readonly<{ home: string; login: string }>;
function ReadError({ error, retry, label = "重试读取", scope = "conversation" }: { error: ChatApiError; retry: () => void; label?: string; scope?: "list" | "conversation" }) {
  return <div className="chat-read-error" role="alert"><Info aria-hidden="true" /><p>{errorMessage(error, scope)}</p><Button variant="outline" onClick={retry}>{label}</Button></div>;
}
function ReadShell({ controller, links, pathname }: { controller: ReadController; links: ReadLinks; pathname: string }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const { chat, status } = snapshot;
  const selected = chat.active;
  const list = chat.conversations;
  const [mobileOpen, setMobileOpen] = useState(parseReadPath(pathname).conversationId !== null);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState("");
  const [visibleSeq, setVisibleSeq] = useState<number | null>(null);
  const history = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastInitialized = useRef<number | null>(null);
  const previousStatus = useRef(status);
  const activeSummary = list.items.find((entry) => entry.id === selected?.id);
  const ready = status === "ready";
  const activeReady = ready && selected?.phase === "ready" && selected.context !== null;
  const busy = selected?.operation !== null && selected?.operation !== undefined;
  const viewport = () => history.current?.closest<HTMLElement>("[data-slot=scroll-area-viewport]") ?? null;
  const measureVisible = () => {
    const view = viewport();
    const shown = document.visibilityState === "visible" && Boolean(section.current?.getClientRects().length);
    const markers = history.current ? [...history.current.querySelectorAll<HTMLElement>("[data-read-seq]")].filter((element) => element.getClientRects().length > 0)
      .map((element) => ({ seq: Number(element.dataset.readSeq), rect: element.getBoundingClientRect() })) : [];
    if (!view) return null;
    const visual = window.visualViewport;
    const screen: ViewRect = { top: visual?.offsetTop ?? 0, left: visual?.offsetLeft ?? 0,
      bottom: (visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight), right: (visual?.offsetLeft ?? 0) + (visual?.width ?? window.innerWidth) };
    const clips: ViewRect[] = [view.getBoundingClientRect(), screen, { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth }];
    for (let parent = view.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent); const rect = parent.getBoundingClientRect();
      const clipX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX); const clipY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
      if (clipX || clipY) clips.push({ left: clipX ? rect.left : screen.left, right: clipX ? rect.right : screen.right, top: clipY ? rect.top : screen.top, bottom: clipY ? rect.bottom : screen.bottom });
    }
    const visible = intersectViewRects(clips);
    return visible ? visibleReadSeq(markers, visible, shown, document.hasFocus()) : null;
  };
  const run = (operation: () => Promise<unknown>) => {
    setNotice("");
    void operation().catch(() => { if (controller.snapshot().status === "ready") setNotice("当前操作暂不可用，请等待读取完成或刷新页面。"); });
  };
  const navigate = (id: number | null, replace = false) => {
    const path = readPath(id);
    const previousId = selected?.id;
    if (replace) window.history.replaceState(null, "", path); else if (location.pathname !== path) window.history.pushState(null, "", path);
    setMobileOpen(id !== null); setNotice(""); setVisibleSeq(null);
    run(() => controller.navigate(path));
    requestAnimationFrame(() => id === null ? document.querySelector<HTMLButtonElement>(`[data-conversation-id="${previousId}"]`)?.focus() : heading.current?.focus());
  };
  useEffect(() => {
    const pop = () => {
      try { const route = parseReadPath(location.pathname); setMobileOpen(route.conversationId !== null); run(() => controller.navigate(location.pathname)); }
      catch { controller.suspend(); }
    };
    window.addEventListener("popstate", pop);
    return () => { window.removeEventListener("popstate", pop); };
  }, [controller]);
  useEffect(() => {
    document.documentElement.dataset.chatMotion = paused ? "paused" : "playing";
    const hidden = () => { document.documentElement.dataset.chatHidden = String(document.hidden); }; hidden();
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); delete document.documentElement.dataset.chatMotion; delete document.documentElement.dataset.chatHidden; };
  }, [paused]);
  useEffect(() => {
    if (previousStatus.current !== status && status !== "ready") { setNotice(""); setVisibleSeq(null); }
    previousStatus.current = status;
  }, [status]);
  useLayoutEffect(() => {
    if (selected?.phase !== "ready") { if (!selected?.context) lastInitialized.current = null; return; }
    if (lastInitialized.current !== selected.id) { const view = viewport(); if (view) view.scrollTop = view.scrollHeight; lastInitialized.current = selected.id; }
  }, [selected?.id, selected?.phase, selected?.messages]);
  useEffect(() => {
    const view = viewport(); const update = () => setVisibleSeq(measureVisible());
    update(); view?.addEventListener("scroll", update, { passive: true }); window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update); window.visualViewport?.addEventListener("scroll", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (history.current) observer?.observe(history.current);
    return () => { view?.removeEventListener("scroll", update); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update); observer?.disconnect(); };
  }, [selected?.id, selected?.messages, selected?.operation, mobileOpen, status]);
  const older = () => {
    const view = viewport(); const oldHeight = view?.scrollHeight ?? 0; const oldTop = view?.scrollTop ?? 0; const id = selected?.id;
    run(async () => { await controller.older(); requestAnimationFrame(() => { if (view && controller.snapshot().chat.active?.id === id) view.scrollTop = oldTop + view.scrollHeight - oldHeight; }); });
  };
  const newer = () => {
    const view = viewport(); const atBottom = view ? view.scrollHeight - view.scrollTop - view.clientHeight < 48 : false; const id = selected?.id;
    run(async () => { await controller.newer(); requestAnimationFrame(() => { if (view && atBottom && controller.snapshot().chat.active?.id === id) view.scrollTop = view.scrollHeight; }); });
  };
  const acknowledge = () => {
    const seq = measureVisible();
    if (!selected || seq === null) { setNotice("请先查看消息，再确认已读位置。"); return; }
    run(() => controller.acknowledgeVisible({ conversationId: selected.id, seq, visible: document.visibilityState === "visible", focused: document.hasFocus() }));
  };
  const canAcknowledge = activeReady && !busy && visibleSeq !== null && selected.readSeq !== null && visibleSeq > selected.readSeq;

  return <div className="conversation-page chat-integration-page chat-read-page" data-state={status === "ready" ? "read" : status} data-motion={paused ? "paused" : "playing"}>
    <div className="chat-atmosphere" aria-hidden="true"><div className="atmosphere-wash"><span className="atmosphere-violet" /><span className="atmosphere-lime" /></div><div className="atmosphere-rings"><i /><i /><i /></div><div className="atmosphere-specks" /></div>
    <a className="skip-link" href="#conversation-main">跳到聊天页面</a>
    <header className="app-header"><a className="brand-link" href={links.home} aria-label="返回同频首页"><Brand /></a><span className="header-note">一个人的灵感，一群人的作品</span>
      <div className="header-actions"><span className="preview-label"><span />私聊读取</span><ChatThemeToggle /><button type="button" className="icon-button motion-button" aria-label={paused ? "播放背景动效" : "暂停背景动效"} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button><a className="home-link" href={links.home}>回到首页<ArrowUpRight aria-hidden="true" /></a></div>
    </header>
    <main id="conversation-main" className="conversation-shell" tabIndex={-1} data-chat-open={mobileOpen || (status !== "idle" && !ready)}>
      <nav className="navigation-rail" aria-label="聊天页面导航"><span className="rail-spark" aria-hidden="true"><Sparkles /></span><button type="button" className="rail-item" aria-pressed={!mobileOpen} disabled={!ready} onClick={() => navigate(null)}><MessageCircle aria-hidden="true" /><span>消息</span></button><button type="button" className="rail-item" disabled aria-label="群聊，尚未开放"><Users aria-hidden="true" /><span>群聊</span></button><div className="rail-bottom"><a className="rail-item" href={links.home}><ArrowUpRight aria-hidden="true" /><span>回到首页</span></a></div></nav>
      <aside className="conversation-list" aria-label="私聊会话列表">
        <div className="list-heading"><div><div className="eyebrow">好想法，从聊聊开始</div><h1>消息</h1></div><button type="button" className="icon-button new-button" disabled aria-label="新建会话，尚未开放"><Plus aria-hidden="true" /></button></div>
        <label className="chat-search"><Search aria-hidden="true" /><Input disabled aria-label="搜索会话，尚未开放" placeholder="会话搜索尚未开放" /></label>
        <div className="filter-tabs" role="group" aria-label="当前仅开放私聊读取"><button type="button" aria-pressed="true" disabled>私聊</button><button type="button" disabled>群聊</button><button type="button" disabled>好友申请</button></div>
        <div className="list-section-label"><span>获准会话</span><button type="button" className="icon-button" aria-label="刷新会话列表" disabled={!ready || list.phase === "loading"} onClick={() => run(() => controller.refreshList())}><RefreshCw aria-hidden="true" /></button></div>
        <ScrollArea className="chat-list-scroll"><div className="chat-list-items" aria-busy={list.phase === "loading"}>
          {ready && list.items.map((item) => <button type="button" key={item.id} className="chat-list-item" data-conversation-id={item.id} aria-current={selected?.id === item.id ? "true" : undefined} onClick={() => navigate(item.id)}><span className="person-avatar" aria-hidden="true"><MessageCircle /></span><span className="chat-item-copy"><span className="chat-item-name"><strong>{conversationTitle(item)}</strong>{item.last_message && <time dateTime={item.last_message.created_at}>{shortTimestamp(item.last_message.created_at)}</time>}</span><span className="chat-item-preview">{messagePreview(item.last_message)}</span><span className="chat-read-conversation-ref">会话 {item.id}</span></span>{item.unread_count > 0 && <span className="item-markers"><span className="unread-count" aria-label={`${item.unread_count} 条未读消息`}>{item.unread_count}</span></span>}</button>)}
        </div>
          {ready && list.phase === "loading" && <p className="chat-read-inline-status" role="status">正在读取会话…</p>}
          {ready && list.error && (!mobileOpen || selected) && <ReadError error={list.error} scope="list" retry={() => run(() => controller.refreshList())} />}
          {ready && list.phase === "ready" && list.items.length === 0 && !list.error && <div className="list-empty"><MessageCircle aria-hidden="true" /><p>目前没有获准的私聊会话</p><span>新的会话会在服务端建立后出现。</span></div>}
          {ready && list.hasMore && <div className="chat-read-pagination"><Button variant="outline" disabled={list.phase === "loading"} onClick={() => run(() => controller.moreConversations())}>加载更多会话</Button></div>}
          {!ready && <p className="chat-read-inline-status">{status === "idle" ? "准备读取会话…" : "聊天内容已清除"}</p>}
        </ScrollArea>
        <p className="chat-shell-sidebar-foot"><ShieldCheck aria-hidden="true" />仅显示当前账号获准的私聊，群聊尚未开放。</p>
      </aside>
      <section ref={section} className="active-conversation chat-read-content" aria-labelledby="chat-read-title">
        <header className="thread-header"><button type="button" className="icon-button back-button" aria-label="返回会话列表" disabled={!ready} onClick={() => navigate(null)}><ArrowLeft aria-hidden="true" /></button><span className="person-avatar" aria-hidden="true"><MessageCircle /></span><div className="thread-heading"><h2 id="chat-read-title" ref={heading} tabIndex={-1}>{selected && ready ? conversationTitle(activeSummary) : "让对话，从这里继续"}</h2><p>{selected && ready ? `会话 ${selected.id} · 私聊读取` : "选择一段会话，继续阅读"}</p></div><span className="chat-shell-stage-label">发送尚未开放</span></header>
        {!ready ? <div className="chat-read-page-status" role="status"><ShieldCheck aria-hidden="true" /><h2>{status === "signed-out" ? "登录已失效" : status === "idle" ? "正在准备聊天" : "请重新打开聊天"}</h2><p>{status === "signed-out" ? "聊天内容已清除。请重新登录，再打开聊天。" : "为保护会话信息，请刷新页面后继续读取。"}</p><div className="chat-shell-links">{status === "signed-out" ? <a className="chat-shell-primary-link" href={links.login}>前往登录<LogIn aria-hidden="true" /></a> : <Button onClick={() => location.reload()}>刷新页面</Button>}<a className="chat-shell-secondary-link" href={links.home}>回到首页<ArrowUpRight aria-hidden="true" /></a></div></div>
          : !selected ? <div className="chat-read-page-status"><MessageCircle aria-hidden="true" /><h2>{list.error ? "暂时无法读取会话" : list.phase === "loading" ? "正在读取会话" : "选择一段私聊"}</h2>{list.error ? <>{mobileOpen ? <ReadError error={list.error} scope="list" retry={() => run(() => controller.refreshList())} /> : <p>{errorMessage(list.error, "list")}</p>}<a className="chat-shell-secondary-link" href={links.home}>回到首页<ArrowUpRight aria-hidden="true" /></a></> : list.phase === "loading" ? <p role="status">正在确认当前账号可访问的会话，请稍候。</p> : <p>从会话列表选择一段私聊。当前支持查看历史和确认已读，发送、附件和群聊尚未开放。</p>}</div>
          : <><div className="chat-read-thread-tools"><span>{selected.unreadCount === null ? "尚未取得未读状态" : `${selected.unreadCount} 条未读消息`}</span><Button variant="outline" disabled={busy} onClick={() => run(() => controller.refreshHistory())}><RefreshCw aria-hidden="true" />重新读取</Button><Button variant="outline" disabled={!activeReady || busy} onClick={newer}>检查新消息</Button></div>
            <ScrollArea className="messages-scroll" viewportClassName="message-viewport"><div className="message-history" ref={history} aria-label="聊天记录" aria-busy={busy}>
              {selected.hasOlder && <div className="chat-read-pagination"><Button variant="outline" disabled={busy} onClick={older}><ChevronUp aria-hidden="true" />加载更早消息</Button></div>}
              {selected.operation && <p className="chat-read-inline-status" role="status">{selected.operation === "read-state" ? "正在保存已读位置…" : "正在读取消息…"}</p>}
              {selected.error && <ReadError error={selected.error} retry={() => run(() => controller.refreshHistory())} label="重新读取会话" />}
              {activeReady && selected.messages.length === 0 && !selected.error && <div className="chat-read-page-status chat-read-empty-history"><MessageCircle aria-hidden="true" /><h2>这段会话还没有消息</h2><p>没有补充任何示例内容，发送功能尚未开放。</p></div>}
              {selected.messages.map((entry) => { const own = entry.sender.status === "available" && entry.sender.user_id === chat.actorId; return <article key={entry.id} className={`message-row${own ? " message-own" : ""}`} data-message-id={entry.id}><span className="person-avatar avatar-small" aria-hidden="true"><MessageCircle /></span><div className="message-stack"><div className="message-author">{messageAuthor(entry, chat.actorId)}<time dateTime={entry.created_at}>{shortTimestamp(entry.created_at)}</time></div><Bubble variant={own ? "default" : "secondary"} align={own ? "end" : "start"} className="message-bubble"><BubbleContent><p>{entry.kind === "deleted" ? "此消息已删除" : entry.body}</p></BubbleContent></Bubble><span className="chat-read-marker" data-read-seq={entry.seq} aria-hidden="true" /></div></article>; })}
              {selected.hasMoreNewer && <div className="chat-read-pagination"><Button variant="outline" disabled={busy} onClick={newer}>继续读取新消息</Button></div>}
            </div></ScrollArea>
            <div className="chat-read-receipt"><p>{selected.readSeq === null ? "尚未取得已读位置" : visibleSeq !== null && visibleSeq <= selected.readSeq ? "当前可见位置已读" : "查看消息后，可确认当前可见位置已读。"}</p><Button variant="outline" disabled={!canAcknowledge} onClick={acknowledge}><Check aria-hidden="true" />已看到这里</Button></div></>}
        <div className="composer-area chat-shell-composer"><div className="message-composer" aria-describedby="chat-read-write-notice"><label className="sr-only" htmlFor="chat-read-draft">消息输入，发送尚未开放</label><textarea id="chat-read-draft" rows={2} disabled placeholder="当前支持读取私聊，发送功能尚未开放" /><div className="composer-toolbar"><button type="button" className="icon-button" disabled aria-label="添加附件，尚未开放"><Paperclip aria-hidden="true" /></button><span className="keyboard-hint">发送与附件暂不可用</span><Button className="send-button" disabled>发送<Send aria-hidden="true" /></Button></div></div><p className="demo-footnote" id="chat-read-write-notice">只在点击“已看到这里”时更新已读，不自动发送消息。</p>{notice && <p className="chat-read-inline-status" role="status">{notice}</p>}</div>
      </section>
    </main><p className="page-caption"><span>同频，让相遇有下文。</span><span>在这里，好好说话，一起做事。<Sparkles aria-hidden="true" /></span></p>
  </div>;
}
export function ReadEntry(props: { controller: ReadController; links: ReadLinks; pathname: string }) {
  return <ChatThemeProvider><ReadShell {...props} /></ChatThemeProvider>;
}
