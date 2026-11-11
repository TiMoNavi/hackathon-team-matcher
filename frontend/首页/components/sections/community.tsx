"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import {
  ArrowLeft, ArrowRight, Check, ChevronRight, Code2, Hash,
  MapPin, MessageCircle, Pause, Play, RotateCcw, Send, Sparkles, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMotionPreference } from "@/components/motion-preference";
import { KineticHeading } from "@/components/effects/kinetic-heading";
import { MaterialSurface } from "@/components/effects/material-surface";
import { cn } from "@/lib/utils";
import { people } from "@/lib/people";

// Signalry features.tsx supplies the section scale, 64/36 split and card theme.
// Soho chats-view/chat-content supply the list → thread → composer structure.
// Everything here is a local, fictional demonstration, with no API calls.
type DemoMessage = { id: string; name: string; text: string; avatar?: number; role?: string; ai?: boolean; own?: boolean };
type Room = { id: string; title: string; topic: string; members: string; messages: DemoMessage[]; reply: string };

function member(avatar: number) {
  const person = people.find((item) => item.image === avatar)!;
  return { name: person.name, role: person.role, avatar };
}

const rooms: Room[] = [
  {
    id: "city", title: "城市漫游计划", topic: "让每一次散步，都有新发现", members: "4 位伙伴 · 1 位 AI 助手",
    messages: [
      { id: "c1", ...member(2), text: "想做一个帮人发现城市小店的地图，周末一起试试？" },
      { id: "c2", ...member(1), text: "我来做地图界面！正好一直想做个有意思的小产品。" },
      { id: "c3", ...member(3), text: "那我负责交互。先让用户选一个心情，再生成散步路线。" },
      { id: "c4", ...member(2), text: "@AI 帮我们把刚才的想法整理一下？" },
      { id: "c5", name: "项目 AI", ai: true, text: "第一步可以很小：选心情 → 推荐 3 家小店 → 生成一条路线。先把这段体验做顺。" },
      { id: "c6", ...member(1), text: "就这么定了。今晚先把第一个版本跑起来 🙌" },
    ],
    reply: "根据这段演示讨论，建议先分三件事：陈序整理路线推荐逻辑，林小满搭地图原型，许知夏画出选心情的流程。先一起确认，再开始动手。",
  },
  {
    id: "garden", title: "开源小花园", topic: "给第一次开源，多一点陪伴", members: "3 位伙伴 · 1 位 AI 助手",
    messages: [
      { id: "g1", ...member(4), text: "想做一个帮新手找到第一个开源 issue 的小工具。" },
      { id: "g2", ...member(2), text: "我第一次提 PR 的时候也很迷茫。可以从熟悉的技术栈开始选。" },
      { id: "g3", ...member(5), text: "我可以做个交互式的新手引导，让第一步更有意思。" },
      { id: "g4", ...member(4), text: "@AI 帮忙整理一个最小可用版本吧。" },
      { id: "g5", name: "项目 AI", ai: true, text: "先做三步：选择技术栈、查看入门 issue、阅读贡献指南。由用户自己决定去哪里贡献。" },
    ],
    reply: "可以先做一份经过人工确认的开源项目清单，展示技术栈、入门任务和贡献指南。第一版只需要帮助新人迈出第一步。",
  },
];

function MessageAvatar({ message }: { message: DemoMessage }) {
  if (message.ai) return <span className="community-ai-avatar flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="size-4" aria-hidden /></span>;
  if (message.own) return <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary shadow-sm">我</span>;
  return <Image src={`/avatars/avatar-${message.avatar}.jpg`} alt="" width={32} height={32} className="size-8 shrink-0 rounded-full object-cover shadow-sm" />;
}

export default function Community() {
  const stage = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const chatHeading = useRef<HTMLHeadingElement>(null);
  const nextMessageId = useRef(0);
  const inView = useInView(stage, { amount: 0.2 });
  const { reduced: reducedMotion, paused: globalPaused } = useMotionPreference();
  const [roomId, setRoomId] = useState("city");
  const [counts, setCounts] = useState<Record<string, number>>({ city: 2, garden: 2 });
  const [localMessages, setLocalMessages] = useState<Record<string, DemoMessage[]>>({ city: [], garden: [] });
  const [drafts, setDrafts] = useState<Record<string, string>>({ city: "", garden: "" });
  const [showList, setShowList] = useState(false);
  const [paused, setPaused] = useState(false);
  const [joined, setJoined] = useState(false);
  const [notice, setNotice] = useState("");
  const room = rooms.find((item) => item.id === roomId)!;
  const visibleCount = reducedMotion ? room.messages.length : counts[roomId];
  const messages = [...room.messages.slice(0, visibleCount), ...localMessages[roomId]];
  const motionPaused = paused || globalPaused || !!reducedMotion;
  const playing = !motionPaused && visibleCount < room.messages.length;
  const nextMessage = room.messages[visibleCount];

  useEffect(() => {
    if (!inView || !playing) return;
    const timer = window.setInterval(() => {
      if (document.hidden || document.documentElement.dataset.motion === "paused") return;
      setCounts((current) => ({ ...current, [roomId]: Math.min(current[roomId] + 1, room.messages.length) }));
    }, 3300);
    return () => window.clearInterval(timer);
  }, [inView, playing, roomId, room.messages.length]);

  useEffect(() => {
    const container = viewport.current;
    if (container && followBottom.current) container.scrollTo({ top: container.scrollHeight, behavior: "instant" });
  }, [roomId, messages.length]);

  function selectRoom(id: string) {
    followBottom.current = true;
    setRoomId(id);
    setShowList(false);
    setNotice("");
    if (window.matchMedia("(max-width: 767px)").matches) {
      window.requestAnimationFrame(() => chatHeading.current?.focus());
    }
  }

  function openList() {
    setShowList(true);
    window.requestAnimationFrame(() => {
      stage.current?.querySelector<HTMLButtonElement>(`[data-room-id="${roomId}"]`)?.focus();
    });
  }

  function appendMessage(message: Omit<DemoMessage, "id">) {
    nextMessageId.current += 1;
    const id = `local-${nextMessageId.current}`;
    followBottom.current = true;
    setLocalMessages((current) => ({
      ...current,
      [roomId]: [...current[roomId], { ...message, id }],
    }));
  }

  function send(event: FormEvent) {
    event.preventDefault();
    const text = drafts[roomId].trim();
    if (!text) return;
    setCounts((current) => ({ ...current, [roomId]: room.messages.length }));
    appendMessage({ name: "你", text, own: true });
    setDrafts((current) => ({ ...current, [roomId]: "" }));
    setNotice("消息已显示在本地演示中，未发送到服务器。");
  }

  function askAI() {
    setCounts((current) => ({ ...current, [roomId]: room.messages.length }));
    appendMessage({ name: "项目 AI · 示例回复", text: room.reply, ai: true });
    setNotice("已展示预写 AI 建议，本次没有调用模型。");
  }

  return (
    <section id="community" data-paused={motionPaused || !inView ? "true" : "false"} className="community-scene relative overflow-hidden bg-muted px-5 py-16 text-foreground md:px-10 md:py-20 lg:px-24 lg:py-[120px]">
      <div aria-hidden className="community-aurora community-aurora-violet pointer-events-none absolute -right-36 top-16 size-[620px] rounded-full" />
      <div aria-hidden className="community-aurora community-aurora-lime pointer-events-none absolute -bottom-64 -left-48 size-[560px] rounded-full" />
      <div aria-hidden className="community-horizon pointer-events-none absolute inset-x-0 top-[47%] h-px" />
      <div className="relative mx-auto w-full max-w-[1248px]">
        <div className="mb-12 flex flex-col justify-between gap-6 lg:mb-16 lg:flex-row lg:items-end">
          <div>
            <Badge variant="outline" className="mb-5 h-auto gap-2 rounded-full border-0 bg-secondary px-3.5 py-2 text-body backdrop-blur-sm"><MessageCircle className="size-3.5 text-primary" />一起，把想法做出来</Badge>
            <KineticHeading first="从「你好」，" second="到「我们来做」。" />
          </div>
          <p className="max-w-[400px] text-base leading-[1.8] text-muted-foreground md:text-lg">从一句打招呼，到一个想法群。<br />和伙伴一起聊方向、分任务，需要时，叫上 AI 帮忙理清下一步。</p>
        </div>

        <div ref={stage} data-paused={motionPaused ? "true" : "false"} className="community-stage flex flex-col gap-5 lg:flex-row">
          <Card className="community-chat-shell min-w-0 gap-0 overflow-hidden rounded-[24px] border-0 bg-background p-0 text-foreground ring-0 lg:w-[64%]">
            <div className="community-chat-toolbar flex h-12 shrink-0 items-center justify-between gap-2 px-4">
              <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground"><span className="community-live-dot size-1.5 shrink-0 rounded-full bg-primary" />想法群聊<span className="text-muted-foreground/40">/</span>互动演示</span>
              <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-background/70 px-0.5">
                <Button variant="ghost" size="icon-sm" aria-label={paused ? "播放聊天演示" : "暂停聊天演示"} onClick={() => setPaused((value) => !value)} disabled={!!reducedMotion}>{paused ? <Play /> : <Pause />}</Button>
                <Button variant="ghost" size="icon-sm" aria-label="重播当前聊天演示" onClick={() => { setCounts((current) => ({ ...current, [roomId]: 2 })); setPaused(false); setLocalMessages((current) => ({ ...current, [roomId]: [] })); setNotice("已重置当前演示对话。"); }}><RotateCcw /></Button>
              </div>
            </div>
            <div className="relative flex h-[470px] min-h-0 md:h-[480px]">
              <div aria-hidden className="hidden w-12 shrink-0 flex-col items-center gap-6 bg-secondary/50 py-6 xl:flex">
                <span className="community-rail-active flex size-8 items-center justify-center rounded-xl bg-primary text-white"><MessageCircle className="size-4" /></span><Users className="size-4 text-muted-foreground/50" /><Code2 className="size-4 text-muted-foreground/50" /><span className="mt-auto size-6 rounded-full border-4 border-secondary bg-primary/40" />
              </div>
              <aside aria-label="演示想法群列表" className={cn("min-h-0 shrink-0 flex-col bg-muted md:flex md:w-[170px]", showList ? "absolute inset-0 z-20 flex w-full md:static md:inset-auto md:z-auto" : "hidden")}>
                <div className="px-4 pb-4 pt-5"><p className="font-semibold">我们的想法</p><p className="mt-1.5 text-[11px] text-muted-foreground">周末造物场 · 演示</p></div>
                <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2">
                  {rooms.map((item) => <button key={item.id} data-room-id={item.id} type="button" onClick={() => selectRoom(item.id)} aria-current={roomId === item.id ? "true" : undefined} className={cn("flex w-full items-start gap-2.5 rounded-xl p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary", roomId === item.id ? "community-room-active bg-background" : "hover:bg-background/70")}><span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", roomId === item.id ? "bg-primary text-white shadow-sm" : "bg-background text-muted-foreground")}><Hash className="size-3.5" /></span><span className="min-w-0"><span className="block text-xs font-semibold">{item.title}</span><span className="mt-1 block truncate text-[11px] text-muted-foreground">{item.topic}</span></span></button>)}
                </nav>
                <div className="m-3 rounded-xl bg-secondary/50 p-3 text-[11px] leading-relaxed text-muted-foreground">每个想法，都有自己的伙伴和讨论空间。</div>
              </aside>
              <div className={cn("min-w-0 flex-1 flex-col bg-muted/35", showList ? "hidden md:flex" : "flex")}>
                <div className="community-thread-header relative z-10 flex h-[70px] shrink-0 items-center gap-2 bg-background/85 px-3 backdrop-blur-sm md:px-5">
                  <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={openList} aria-label="返回演示会话列表"><ArrowLeft /></Button>
                  <div className="min-w-0"><h3 ref={chatHeading} tabIndex={-1} className="rounded text-sm font-semibold outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">{room.title}</h3><p className="mt-1 text-[11px] text-muted-foreground">{room.members}</p></div>
                  <span className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full bg-secondary/70 px-2.5 py-1.5 text-[11px] font-medium text-primary sm:flex"><Sparkles className="size-3" />AI 在群里</span>
                </div>
                <div ref={viewport} onScroll={(event) => { const target = event.currentTarget; followBottom.current = target.scrollHeight - target.scrollTop - target.clientHeight < 80; }} role="log" aria-label={`${room.title}演示消息`} aria-live="off" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 outline-offset-[-3px] focus-visible:outline-2 focus-visible:outline-primary md:px-5">
                  <p className="mb-5 text-center text-[11px] text-muted-foreground/75">一个想法，正在变成一支小队</p>
                  <AnimatePresence initial={false}>
                    {messages.map((message) => <motion.div key={`${roomId}-${message.id}`} initial={{ opacity: motionPaused ? 1 : 0, y: motionPaused ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: motionPaused ? 0 : 0.35 }} className={cn("mb-4 flex items-start gap-2.5", message.own && "flex-row-reverse")}><MessageAvatar message={message} /><div className="min-w-0 max-w-[88%]"><div title={message.role} className={cn("mb-1.5 text-[11px] text-muted-foreground", message.own && "text-right")}>{message.name}</div><div className={cn("community-bubble rounded-2xl px-3.5 py-3 text-[13px] leading-[1.8] break-words", message.ai ? "community-ai-bubble rounded-tl-sm text-body" : message.own ? "community-own-bubble rounded-tr-sm bg-primary text-white" : "rounded-tl-sm bg-background text-body")}>{message.text}</div></div></motion.div>)}
                  </AnimatePresence>
                  {playing && <div className="community-typing flex w-fit items-center gap-1.5 rounded-full bg-background px-2 py-1.5 text-[11px] text-muted-foreground shadow-sm" aria-label="演示伙伴正在输入">{nextMessage?.avatar ? <Image src={`/avatars/avatar-${nextMessage.avatar}.jpg`} alt="" width={20} height={20} className="mr-1 size-5 rounded-full object-cover" /> : <Sparkles className="mr-1 size-3.5 text-primary" />}<span className="mr-1">伙伴正在输入</span>{[0, 1, 2].map((i) => <span key={i} className="community-dot size-1 rounded-full bg-primary/50" style={{ animationDelay: `${i * 0.18}s` }} />)}</div>}
                </div>
                <div className="community-composer relative z-10 shrink-0 bg-background px-3 pb-3 pt-2.5 md:px-4">
                  <div className="mb-2 flex items-center justify-between gap-2"><Button variant="ghost" size="xs" onClick={askAI} className="h-7 gap-1.5 rounded-lg bg-secondary/50 px-2 text-[11px] text-primary hover:bg-secondary"><Sparkles className="size-3" />让 AI 理清下一步</Button><span className="text-[11px] text-muted-foreground">仅本地演示</span></div>
                  <form onSubmit={send} className="flex min-w-0 items-center gap-2"><label htmlFor="demo-chat-message" className="sr-only">输入演示消息</label><Input id="demo-chat-message" value={drafts[roomId]} maxLength={300} onChange={(event) => setDrafts((current) => ({ ...current, [roomId]: event.target.value }))} placeholder="说说你的想法…" autoComplete="off" className="h-10 rounded-xl border-transparent bg-muted text-xs shadow-none focus-visible:bg-background" /><Button type="submit" size="icon-lg" disabled={!drafts[roomId].trim()} aria-label="发送演示消息" className="community-send-button rounded-xl"><Send className="size-4" /></Button></form>
                </div>
              </div>
            </div>
          </Card>

          <MaterialSurface id="demo-event" data-joined={joined ? "true" : "false"} className="community-event-panel relative flex min-w-0 flex-col rounded-[24px] p-7 md:p-8 lg:w-[36%]">
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">下一段合作，从这里开始</span><Badge variant="outline" className="h-auto shrink-0 rounded-full border-0 bg-background/85 px-2.5 py-1.5 text-[11px] text-muted-foreground">演示活动</Badge></div>
            <div className="community-event-poster relative mt-6 flex min-h-[180px] items-center overflow-hidden rounded-2xl bg-lime p-6 text-night">
              <div aria-hidden className="community-poster-light pointer-events-none absolute inset-0" />
              <div className="relative z-10"><span className="font-heading text-[11px] font-bold tracking-[0.12em]">BUILD TOGETHER</span><h3 className="mt-3 font-heading text-[36px] font-semibold leading-[1.2] tracking-[-0.03em]">周末<br />造物场</h3></div>
              <div aria-hidden className="community-event-art absolute -right-5 top-10 flex size-[140px] rotate-[-12deg] items-center justify-center rounded-[30px] bg-background text-primary shadow-xl"><div className="absolute left-6 top-5 flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-primary/20" />)}</div><Code2 className="mt-3 size-[76px] stroke-[1.25]" /></div>
              <div aria-hidden className="absolute -bottom-14 right-7 size-28 rounded-full bg-primary/10 blur-[2px]" />
              {joined && <div aria-hidden className="community-join-sparks pointer-events-none absolute inset-0 z-20">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="community-spark absolute size-1.5 rounded-full bg-primary" style={{ left: `${20 + i * 13}%`, top: `${25 + (i % 3) * 15}%`, animationDelay: `${i * 0.07}s` }} />)}</div>}
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="size-3.5 text-primary" />线下相见，线上一起推进</div>
            <p className="mt-3 text-sm leading-[1.8] text-body">带上你的技能，也带上还没完成的想法。通过邀请码加入活动，遇见这次和你同场的伙伴。</p>
            <div className="mb-6 mt-5 flex items-center gap-3"><div className="flex shrink-0 -space-x-2">{[2, 1, 3, 4].map((avatar, index) => <Image key={avatar} src={`/avatars/avatar-${avatar}.jpg`} alt="" width={32} height={32} style={{ animationDelay: `${index * -0.8}s` }} className="community-member-avatar size-8 rounded-full border-2 border-background object-cover" />)}<AnimatePresence>{joined && <motion.span aria-hidden initial={{ scale: motionPaused ? 1 : 0, opacity: motionPaused ? 1 : 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: motionPaused ? 1 : 0, opacity: 0 }} transition={{ duration: motionPaused ? 0 : 0.3 }} className="relative z-10 flex size-8 items-center justify-center rounded-full border-2 border-background bg-lime text-[11px] font-semibold text-night">我</motion.span>}</AnimatePresence></div><span className="text-[11px] text-muted-foreground">不同技能，同一个出发点</span></div>
            <Button variant="lime" size="xl" className="community-join-button relative mt-auto w-full overflow-hidden text-sm" onClick={() => { setJoined((value) => !value); setNotice(joined ? "已退出本地活动演示。" : "已体验加入演示活动，没有创建真实成员关系。"); }}>{joined ? <><Check className="size-4" />已体验加入 · 点击重置</> : <>体验加入活动<ArrowRight className="size-4" /></>}</Button>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">正式加入需验证活动邀请码</p>
          </MaterialSurface>
        </div>
        <div className="mt-5 min-h-5 text-center text-xs text-muted-foreground" role="status">{notice || "这里的伙伴、消息与活动均为演示。试着发一句话，或请 AI 整理一下。"}</div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 pt-7 text-sm text-muted-foreground sm:flex-row"><span>从相遇开始，让协作真正发生。</span><a href="#recommendations" className="flex min-h-11 items-center gap-2 rounded-lg text-primary transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">先遇见你的下一位队友<ChevronRight className="size-4" /></a></div>
      </div>
      <style>{`
        /* AffectUI GradientText and Signalry motion adapted to this section only. */
        .community-scene { isolation: isolate; }
        .community-aurora { filter: blur(90px); animation: community-aurora-drift 16s ease-in-out infinite alternate; opacity: .8; }
        .community-aurora-violet { background: radial-gradient(circle, color-mix(in srgb, var(--primary) 18%, transparent), transparent 70%); }
        .community-aurora-lime { background: radial-gradient(circle, color-mix(in srgb, var(--lime) 22%, transparent), transparent 68%); animation-delay: -8s; }
        .community-horizon { background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--primary) 35%, transparent), transparent); box-shadow: 0 0 65px 25px color-mix(in srgb, var(--primary) 7%, transparent); }
        .community-chat-shell { box-shadow: 0 28px 80px -28px color-mix(in srgb, var(--primary) 30%, transparent), 0 8px 32px color-mix(in srgb, var(--primary) 7%, transparent); }
        .community-chat-toolbar { background: linear-gradient(100deg, var(--secondary), var(--muted) 65%); }
        .community-rail-active, .community-ai-avatar, .community-send-button:not(:disabled) { box-shadow: 0 5px 15px -4px color-mix(in srgb, var(--primary) 45%, transparent); }
        .community-ai-avatar { background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 80%, var(--secondary))); }
        .community-room-active { box-shadow: 0 5px 15px -7px color-mix(in srgb, var(--primary) 20%, transparent); }
        .community-thread-header { box-shadow: 0 8px 18px -15px color-mix(in srgb, var(--primary) 22%, transparent); }
        .community-bubble { box-shadow: 0 3px 14px -6px color-mix(in srgb, var(--night) 13%, transparent); }
        .community-ai-bubble { background: linear-gradient(120deg, var(--secondary), color-mix(in srgb, var(--secondary) 35%, var(--background))); box-shadow: 0 4px 18px -10px color-mix(in srgb, var(--primary) 24%, transparent); }
        .community-own-bubble { background: linear-gradient(130deg, var(--primary), color-mix(in srgb, var(--primary) 88%, var(--secondary))); box-shadow: 0 6px 15px -8px var(--primary); }
        .community-composer { box-shadow: 0 -10px 24px -20px color-mix(in srgb, var(--primary) 22%, transparent); }
        .community-send-button:not(:disabled):hover svg { transform: translate(1px, -1px); }
        .community-send-button svg { transition: transform .2s ease; }
        .community-live-dot { animation: community-presence 3s ease-in-out infinite; }
        .community-event-panel { background: radial-gradient(ellipse at 12% 0%, color-mix(in srgb,var(--secondary) 80%,transparent),transparent 70%),var(--background); box-shadow: 0 20px 65px -30px color-mix(in srgb,var(--primary) 24%,transparent),inset 0 1px 0 var(--background); transition: box-shadow .5s ease; }
        .community-event-panel[data-joined="true"] { box-shadow: inset 0 1px 0 color-mix(in srgb, var(--lime) 45%, transparent), 0 18px 65px -30px color-mix(in srgb, var(--lime) 30%, transparent); }
        .community-event-poster { box-shadow: 0 12px 28px -18px color-mix(in srgb, var(--lime) 65%, transparent); background-image: radial-gradient(ellipse at 10% 0%, color-mix(in srgb, var(--background) 50%, transparent), transparent 60%); }
        .community-poster-light { background: linear-gradient(115deg, transparent 30%, color-mix(in srgb, var(--background) 25%, transparent) 48%, transparent 65%); transform: translateX(-100%); animation: community-light-pass 8s ease-in-out infinite; }
        .community-event-art { box-shadow: 0 20px 30px -18px color-mix(in srgb, var(--primary) 22%, transparent), inset 0 1px 0 color-mix(in srgb, var(--background) 18%, transparent); }
        .community-member-avatar { animation: community-avatar-float 5s ease-in-out infinite; box-shadow: 0 4px 10px color-mix(in srgb, var(--primary) 15%, transparent); }
        .community-join-button { box-shadow: 0 8px 26px -14px color-mix(in srgb, var(--lime) 65%, transparent); }
        .community-join-button::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(110deg, transparent 20%, color-mix(in srgb, var(--background) 60%, transparent) 50%, transparent 80%); transform: translateX(-120%); animation: community-light-pass 6s ease-in-out infinite; }
        .community-event-panel[data-joined="true"] .community-join-button::before { opacity: 0; }
        .community-spark { opacity: 0; animation: community-join-spark .85s cubic-bezier(.16, 1, .3, 1) both; }
        @keyframes community-aurora-drift { to { transform: translate3d(45px, -40px, 0) scale(1.12); opacity: 1; } }
        @keyframes community-presence { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 20%, transparent); } 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 0%, transparent); } }
        @keyframes community-light-pass { 0%, 55% { transform: translateX(-120%); } 85%, 100% { transform: translateX(120%); } }
        @keyframes community-avatar-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes community-join-spark { 0% { opacity: 0; transform: translateY(20px) scale(.4); } 30% { opacity: .85; } 100% { opacity: 0; transform: translateY(-30px) scale(1.2); } }
        @keyframes community-dot { 0%, 60%, 100% { opacity: .35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
        @keyframes community-event-float { 0%, 100% { transform: translateY(0) rotate(-12deg); } 50% { transform: translateY(-5px) rotate(-6deg); } }
        .community-event-art { animation: community-event-float 6s ease-in-out infinite; }
        .community-dot { animation: community-dot 1.3s ease-in-out infinite; }
        .community-scene[data-paused="true"] :is(.community-dot, .community-event-art, .community-aurora, .community-live-dot, .community-member-avatar, .community-poster-light, .community-spark, .ui-gt__fill),
        .community-scene[data-paused="true"] .community-join-button::before { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .community-scene :is(.community-dot, .community-event-art, .community-aurora, .community-live-dot, .community-member-avatar, .community-poster-light, .community-spark), .community-join-button::before { animation: none; }
          .community-event-panel, .community-send-button svg { transition: none; }
        }
      `}</style>
    </section>
  );
}
