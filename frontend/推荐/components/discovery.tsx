"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { Dialog as Panel } from "radix-ui";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Bookmark, Check, ChevronDown, Compass, FlaskConical, Leaf, MapPin, MessageCircle, PanelRightClose, Pause, Play, RotateCcw, SlidersHorizontal, Sparkles, Sprout, Users, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TiltCard } from "@/components/effects/tilt-card";
import { FrostCloud } from "@/components/illustrations/frost-cloud";
import { chapters, people, type Branch } from "@/lib/people";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;
const CYCLE = 9200;
function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => { const media = matchMedia(query); media.addEventListener("change", notify); return () => media.removeEventListener("change", notify); },
    () => matchMedia(query).matches,
    () => false,
  );
}
function subscribeVisibility(notify: () => void) { document.addEventListener("visibilitychange", notify); return () => document.removeEventListener("visibilitychange", notify); }
type Message = { role: "user" | "assistant"; text: string };

export default function Discovery() {
  const [personIndex, setPersonIndex] = useState(0);
  const [chapter, setChapter] = useState(0);
  const [replay, setReplay] = useState(0);
  const [auto, setAuto] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [composing, setComposing] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [detail, setDetail] = useState<Branch | "profile" | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState("");
  const [eventOpen, setEventOpen] = useState(false);
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const narrow = useMedia("(max-width: 1099px)");
  const visible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
  const composerRef = useRef<HTMLInputElement>(null);
  const panelInputRef = useRef<HTMLInputElement>(null);
  const panelToggleRef = useRef<HTMLButtonElement>(null);
  const messageEnd = useRef<HTMLDivElement>(null);
  const detailOrigin = useRef<HTMLButtonElement | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const stageVisible = useInView(stageRef, { amount: .2 });
  const person = people[personIndex];
  const playing = auto && !hovered && !focused && !composing && !assistant && !detail && !eventOpen && !reduced && visible && stageVisible;
  const isSaved = saved.includes(person.id);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setChapter((current) => (current + 1) % chapters.length), CYCLE);
    return () => clearTimeout(timer);
  }, [playing, chapter, replay, personIndex]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3200); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { messageEnd.current?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "nearest" }); }, [messages, reduced]);

  function selectPerson(index: number) { setPersonIndex((index + people.length) % people.length); setChapter(0); setAuto(false); setDetail(null); }
  function selectChapter(index: number) { setChapter(index); setAuto(false); }
  function showDetail(value: Branch | "profile", trigger: HTMLButtonElement) { detailOrigin.current = trigger; setDetail(value); setAuto(false); }
  function toggleSave() { setSaved((current) => isSaved ? current.filter((id) => id !== person.id) : [...current, person.id]); setNotice(isSaved ? "已取消本次收藏" : "已收藏到本次浏览，刷新后重置"); }
  function openAssistant() { setAssistant(true); }
  function sendPrompt(value = input) {
    const prompt = value.trim();
    if (!prompt) { composerRef.current?.focus(); return; }
    const response = /设计|产品|figma/i.test(prompt)
      ? "可以先看看许知夏。TA 愿意负责需求梳理和交互设计，正在找能一起把原型做出来的开发伙伴。点下面的按钮，就能展开 TA 的资料。"
      : /时间|周末|协作|节奏/.test(prompt)
        ? person.name + "填写的时间是「" + person.chapters[2][0].title + "」。你可以展开协作节奏，具体碰头时间仍需要你们确认。"
        : "先从" + person.name + "能带来的贡献看起吧。" + person.chapters[0][0].detail + "也可以看看 TA 这次想找怎样的搭档。";
    setMessages((current) => [...current, { role: "user", text: prompt }, { role: "assistant", text: response }]);
    setInput(""); setAssistant(true); setAuto(false);
  }

  return <Panel.Root open={assistant} onOpenChange={setAssistant} modal={narrow}>
    <div className="discovery-app" data-assistant={assistant} data-reduced={reduced}>
      <a className="skip-link" href="#main">跳到推荐内容</a>
      <header className="app-header">
        <div className="glass-nav">
          <a href="http://127.0.0.1:4200/" aria-label="同频首页" className="brand-link"><Brand /></a>
          <nav aria-label="主导航" className="main-nav">
            <a href="#main" aria-current="page"><Compass />发现</a>
            <button onClick={() => setNotice("广场尚未接入此推荐交互原型")}><Users />广场</button>
            <a href="http://127.0.0.1:4202/"><MessageCircle />消息</a>
            <button onClick={() => setNotice("个人中心尚未接入此推荐交互原型")}><Avatar className="nav-avatar"><AvatarImage src="/avatars/avatar-2.jpg" alt="" /><AvatarFallback>我</AvatarFallback></Avatar>个人</button>
          </nav>
          <button className="event-switch" onClick={() => setEventOpen(true)}><span className="event-dot" />周末造物场<ChevronDown size={14} /></button>
        </div>
      </header>

      <div className="workspace">
        <main id="main" className="main-content">
          <div className="context-line"><span><Compass size={14} />发现<span className="slash">/</span>为你展开</span><span className="prototype-label"><FlaskConical size={13} />交互原型 · 演示资料</span></div>
          <div className="page-heading">
            <div><h1>有些合拍，<span>值得慢慢展开。</span></h1><p>从一个人开始，看看你们能一起做什么。</p></div>
            <Button variant="outline" className="preference-button" onClick={openAssistant}><SlidersHorizontal />说说我的期待<ArrowUpRight /></Button>
          </div>
          <section ref={stageRef} className="discovery-stage" aria-label="人物及生长详情" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}>
            <div className="stage-atmosphere" aria-hidden="true" />
            <div className="person-column">
              <div className="person-deck">
                <div className="card-backing backing-one" aria-hidden="true" /><div className="card-backing backing-two" aria-hidden="true" />
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={person.id} initial={{ opacity: 0, y: reduced ? 0 : 18, rotate: reduced ? 0 : -3 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -12, rotate: reduced ? 0 : 2 }} transition={{ duration: reduced ? 0 : .32, ease }} className="person-motion">
                    <TiltCard maxTilt={reduced ? 0 : 3.5} scale={1} glare={!reduced} className="person-tilt">
                      <Card className="person-card gap-0 py-0">
                        <CardContent className="person-cover p-0"><span className="meet-label"><Sprout size={15} />很高兴认识你</span><button className={cn("save-button", isSaved && "is-saved")} onClick={toggleSave} aria-label={isSaved ? "取消收藏" : "收藏这个人"} aria-pressed={isSaved}><Bookmark size={18} fill={isSaved ? "currentColor" : "none"} /></button><div className="cover-orbit orbit-one" /><div className="cover-orbit orbit-two" /><span className="cover-spark"><Sparkles size={22} /></span></CardContent>
                        <CardContent className="person-body">
                          <Avatar className="person-avatar"><AvatarImage src={person.image} alt={person.name + "的演示头像"} /><AvatarFallback>{person.name.slice(0,1)}</AvatarFallback></Avatar>
                          <div className="person-name-line"><h2>{person.name}</h2><span className="english-name">{person.english}</span></div>
                          <p className="person-role">{person.role}</p><p className="person-intro">{person.intro}</p>
                          <div className="person-tags">{person.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                          <div className="person-meta"><span><MapPin size={13} />{person.city}</span><span><span className="tiny-dot" />本次活动参与者</span></div>
                          <Button variant="outline" className="profile-button" onClick={(event) => showDetail("profile", event.currentTarget)}>认识完整的 TA<ArrowUpRight size={16} /></Button>
                        </CardContent>
                      </Card>
                    </TiltCard>
                  </motion.div>
                </AnimatePresence>
                <span className="growth-origin" aria-hidden="true"><Leaf size={16} /></span>
              </div>
              <p className="card-caption"><span />{person.looking}</p>
            </div>

            <div className="growth-column">
              <div className="growth-heading"><div><Sprout size={17} /><span>从 TA 身上，发现一点共鸣</span></div><span className="chapter-count">0{chapter + 1}<span> / 03</span></span></div>
              <div className="growth-bed" data-person={person.id} data-chapter={chapter} data-playing={playing} onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); selectChapter((chapter + (e.key === "ArrowRight" ? 1 : 2)) % 3); } }} tabIndex={0} aria-label="生长详情，左右方向键切换视角">
                <AnimatePresence mode="wait" initial={!reduced}>
                  <motion.div key={person.id + chapter + replay} className="branch-scene" initial="hidden" animate="visible" exit="exit" variants={{ hidden: {}, visible: { transition: { staggerChildren: reduced ? 0 : .11 } }, exit: { transition: { staggerChildren: reduced ? 0 : .035, staggerDirection: -1 } } }}>
                    <motion.svg className="root-lines" viewBox="0 0 100 380" preserveAspectRatio="none" aria-hidden="true" variants={{ hidden: {}, visible: {}, exit: {} }}>
                      {["M0 196 C48 196 34 55 100 55", "M0 196 C46 196 42 159 100 159", "M0 196 C48 196 42 255 100 255", "M0 196 C48 196 34 342 100 342"].map((d, i) => <motion.path key={d} d={d} variants={{ hidden: { pathLength: 0, opacity: 0 }, visible: { pathLength: 1, opacity: 1, transition: { duration: reduced ? 0 : .8, delay: reduced ? 0 : i * .1, ease } }, exit: { pathLength: 0, opacity: 0, transition: { duration: reduced ? 0 : .22 } } }} />)}
                    </motion.svg>
                    {person.chapters[chapter].map((branch, index) => <motion.button key={branch.title} className={"branch branch-" + index} style={{ "--branch-order": index } as CSSProperties} onClick={(event) => showDetail(branch, event.currentTarget)} variants={{ hidden: {}, visible: {}, exit: { opacity: 0, x: reduced ? 0 : -14, transition: { duration: reduced ? 0 : .18 } } }} aria-label={"展开依据：" + branch.title}>
                      <motion.span className="branch-fill" variants={{ hidden: { scaleX: reduced ? 1 : 0 }, visible: { scaleX: 1, transition: { duration: reduced ? 0 : .86, ease } }, exit: { scaleX: reduced ? 1 : .84, transition: { duration: reduced ? 0 : .18 } } }} />
                      <motion.span className="branch-copy" variants={{ hidden: { opacity: reduced ? 1 : 0, x: reduced ? 0 : -18, filter: reduced ? "none" : "blur(3px)" }, visible: { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: reduced ? 0 : .65, delay: reduced ? 0 : .16, ease } } }}><span className="branch-label">{branch.label}</span><strong>{branch.title}</strong>{index === 0 && <span className="branch-note">{branch.note}</span>}</motion.span>
                      <motion.span className="branch-tip" variants={{ hidden: { opacity: 0, scale: .3 }, visible: { opacity: 1, scale: 1, transition: { delay: reduced ? 0 : .5, duration: reduced ? 0 : .45, ease } } }}>{index === 0 ? <ArrowUpRight size={20} /> : <span />}</motion.span>
                    </motion.button>)}
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="perspective-controls" role="group" aria-label="详情视角">{chapters.map((item, i) => <button key={item.title} aria-pressed={chapter === i} onClick={() => selectChapter(i)}><span className="perspective-dot" />{item.short}</button>)}</div>
              <div className="growth-footnote"><span>{chapters[chapter].subtitle}</span><span>点击枝条，展开依据<ArrowUpRight size={12} /></span></div>
            </div>
          </section>

          <div className="browse-controls">
            <div className="people-selector"><span className="selector-label">还可以认识</span>{people.map((p, i) => <button key={p.id} onClick={() => selectPerson(i)} aria-label={"查看" + p.name} aria-pressed={i === personIndex}><Avatar><AvatarImage src={p.image} alt="" /><AvatarFallback>{p.name[0]}</AvatarFallback></Avatar><span>{p.name}</span>{i === personIndex && <span className="selected-person-dot" />}</button>)}</div>
            <div className="playback-controls"><Button variant="ghost" className="replay-control" onClick={() => { setReplay((current) => current + 1); setAuto(false); }}><RotateCcw size={14} />重新生长</Button><Button variant="ghost" aria-label={auto && !reduced ? "暂停自动展开" : "开启自动展开"} aria-pressed={auto && !reduced} disabled={reduced} onClick={() => setAuto((current) => !current)}>{auto && !reduced ? <Pause size={14} /> : <Play size={14} />}<span>{reduced ? "静态阅读" : auto ? (playing ? "自动展开" : "阅读中暂停") : "手动浏览"}</span></Button><span className="control-divider" /><Button variant="ghost" className="arrow-button" aria-label="上一位" onClick={() => selectPerson(personIndex - 1)}><ArrowLeft /></Button><span className="person-count">{personIndex + 1} / {people.length}</span><Button variant="ghost" className="arrow-button" aria-label="下一位" onClick={() => selectPerson(personIndex + 1)}><ArrowRight /></Button></div>
          </div>
          <div className="page-note"><span><span className="tiny-dot" />仅展示「周末造物场」内的 3 位演示人物</span><span>字的大小，是这一刻的阅读重点。</span></div>
        </main>
      </div>

      <div className="composer-dock">
        <div className="composer-hint"><Sparkles size={13} />一个想法，也可以成为相遇的起点</div>
        <form className="composer" onFocusCapture={() => setComposing(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setComposing(false); }} onSubmit={(e) => { e.preventDefault(); sendPrompt(); }}>
          <Panel.Trigger asChild><button ref={panelToggleRef} type="button" className="cloud-toggle" aria-label={assistant ? "收起 AI 助手" : "展开 AI 助手"}><span aria-hidden="true"><FrostCloud background={false} paused followPointer={false} className="companion-cloud" /></span></button></Panel.Trigger>
          <label htmlFor="ai-prompt" className="sr-only">告诉 AI 你想找怎样的队友</label><input id="ai-prompt" ref={composerRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="说说你想找怎样的队友…" maxLength={600} autoComplete="off" /><span className="composer-demo">演示</span><Button type="submit" className="send-button" aria-label="发送演示需求" disabled={!input.trim()}><ArrowUp size={20} /></Button>
        </form>
      </div>

      <Panel.Portal>
        {narrow && <Panel.Overlay className="assistant-overlay" />}
        <Panel.Content className="assistant-panel" aria-modal={narrow || undefined} onOpenAutoFocus={(e) => { e.preventDefault(); if (narrow) panelInputRef.current?.focus(); }} onCloseAutoFocus={(e) => { e.preventDefault(); panelToggleRef.current?.focus(); }} onInteractOutside={(e) => { if (!narrow) e.preventDefault(); }}>
          <div className="assistant-header"><div><span className="assistant-mark"><Sparkles size={18} /></span><div><Panel.Title>一起找找灵感</Panel.Title><Panel.Description>当前活动内 · 预设助手演示</Panel.Description></div></div><Panel.Close asChild><Button variant="ghost" className="arrow-button" aria-label="关闭 AI 助手">{narrow ? <X /> : <PanelRightClose />}</Button></Panel.Close></div>
          <div className="assistant-messages">
            <div className="assistant-welcome"><FrostCloud background={false} paused followPointer={false} className="panel-cloud" /><h3>把想法说出来，<br />我们从这里开始。</h3><p>可以聊你想做的东西，也可以先看看，谁能和你互相补上那一块。</p></div>
            <div className="prompt-suggestions"><button onClick={() => sendPrompt("帮我看看设计伙伴")}><span>想找一位设计伙伴</span><ArrowUpRight size={14} /></button><button onClick={() => sendPrompt("看看周末协作的时间")}><span>谁能周末一起做点东西？</span><ArrowUpRight size={14} /></button></div>
            <div className="chat-messages" aria-live="polite" aria-relevant="additions">{messages.map((message, i) => <motion.div key={i} className={"chat-message " + message.role} initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25 }}><span className="message-author">{message.role === "user" ? "你" : "同频 · 演示回复"}</span><p>{message.text}</p></motion.div>)}</div>
            {messages.length > 0 && <div className="assistant-actions"><button onClick={() => { selectPerson(1); if (narrow) setAssistant(false); }}>看看知夏<ArrowUpRight size={13} /></button><button onClick={() => { selectChapter(2); if (narrow) setAssistant(false); }}>展开协作节奏<ArrowUpRight size={13} /></button></div>}
            <div ref={messageEnd} />
          </div>
          <div className="panel-footer"><p><span className="tiny-dot" />人物切换不会清空这段对话</p><form onSubmit={(e) => { e.preventDefault(); sendPrompt(); }}><label htmlFor="panel-prompt" className="sr-only">继续告诉助手你的想法</label><input ref={panelInputRef} id="panel-prompt" value={input} onChange={(e) => setInput(e.target.value)} placeholder="接着说说你的想法…" maxLength={600} /><Button type="submit" aria-label="发送侧栏演示需求" disabled={!input.trim()}><ArrowUp size={17} /></Button></form><span className="panel-disclaimer">本地预设回复，不会发送真实消息。</span></div>
        </Panel.Content>
      </Panel.Portal>

      <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="detail-dialog" aria-modal="true" showCloseButton={false} onCloseAutoFocus={(event) => { event.preventDefault(); detailOrigin.current?.focus(); }}><DialogHeader><DialogTitle>{detail === "profile" ? "认识" + person.name : detail?.title}</DialogTitle><DialogDescription>{detail === "profile" ? "周末造物场 · 本人确认资料的演示" : detail?.label}</DialogDescription></DialogHeader><Button variant="ghost" className="dialog-close" aria-label="关闭详情" onClick={() => setDetail(null)}><X /></Button>
          {detail === "profile" ? <div className="profile-detail"><p>{person.intro}</p>{chapters.map((item, i) => <section key={item.title}><h3>{item.title}</h3><p>{person.chapters[i][0].detail}</p></section>)}<p className="source-line">{person.looking}</p></div> : detail && <><p className="detail-body">{detail.detail}</p><div className="source-line"><Check size={15} /><span>{detail.source}</span></div></>}
          <p className="dialog-footnote">这里展示的是演示资料，推荐细节不代表真实能力评分。</p>
        </DialogContent>
      </Dialog>
      <Dialog open={eventOpen} onOpenChange={setEventOpen}><DialogContent showCloseButton={false}><DialogHeader><DialogTitle>当前活动</DialogTitle><DialogDescription>推荐内容仅在当前活动内展开。</DialogDescription></DialogHeader><Button className="event-choice" variant="secondary" onClick={() => setEventOpen(false)}><Sprout />周末造物场<Check /></Button><p className="text-sm text-muted-foreground">此原型只准备了这一场活动的演示资料。</p><Button variant="outline" onClick={() => setEventOpen(false)}>返回推荐</Button></DialogContent></Dialog>
      <div className="toast-region" role="status"><AnimatePresence>{notice && <motion.div className="notice-toast" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={16} />{notice}</motion.div>}</AnimatePresence></div>
    </div>
  </Panel.Root>;
}
