"use client";

import { useRef, type CSSProperties, type PointerEvent } from "react";
import Image from "next/image";
import { motion, useMotionValue, useSpring } from "motion/react";
import { ArrowDown, ArrowRight, Check, Code2, Heart, Lightbulb, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GradientFloor } from "@/components/effects/gradient-floor";
import { GradientText } from "@/components/effects/gradient-text";
import { GridBackground } from "@/components/effects/grid-background";
import { TextReveal } from "@/components/effects/text-reveal";
import { HeroBeams } from "@/components/effects/hero-beams";
import { KitMarquee } from "@/components/effects/kit-marquee";
import { useMotionPreference } from "@/components/motion-preference";
import { people } from "@/lib/people";

const stories = [
  { pair: [0, 1], title: "小满找到了 AI 搭档", detail: "前端 × AI，把旅行灵感变成作品", icon: Code2 },
  { pair: [2, 3], title: "知夏的想法，有人一起做了", detail: "设计 × 全栈，今晚开工", icon: Lightbulb },
  { pair: [5, 0], title: "你写前端，我来写后端", detail: "一舟与小满，第一次组队", icon: Code2 },
  { pair: [4, 2], title: "唐可遇见了懂交互的队友", detail: "创意 × 设计，一起做点不一样的", icon: Sparkles },
  { pair: [3, 1], title: "两个人的第一个 commit", detail: "从「有人一起吗」到「我们来做」", icon: Heart },
  { pair: [1, 5], title: "一个周末，一起做点酷的", detail: "AI × 后端，让好点子跑起来", icon: Lightbulb },
  { pair: [2, 5], title: "好设计，遇见了好实现", detail: "知夏与一舟，一起打磨第一版", icon: Sparkles },
  { pair: [0, 4], title: "有人接住了你的奇思妙想", detail: "前端 × 创意，让交互更好玩", icon: Heart },
  { pair: [3, 4], title: "周末造物小队，集合完毕", detail: "带着不同的技能，奔向同一个想法", icon: Code2 },
  { pair: [1, 2], title: "第一次黑客松，也有人同行", detail: "AI × 设计，从认识彼此开始", icon: Lightbulb },
];
const lanes = [
  { items: [0, 3, 6, 4], speed: 25, phase: .09, compact: true },
  { items: [2, 0, 4, 1], speed: 34, phase: .28, compact: false },
  { items: [4, 5, 7, 2], speed: 21, phase: .14, compact: true },
  { items: [3, 8, 6, 5], speed: 30, phase: .42, compact: false },
  { items: [5, 9, 7, 0], speed: 23, phase: .22, compact: true },
];

function StoryCard({ index, compact }: { index: number; compact: boolean }) {
  const story = stories[index];
  const Icon = story.icon;
  return (
    <div className={"hero-story " + (compact ? "hero-story-compact" : "hero-story-featured") + ([1,8].includes(index) ? " hero-story-lime" : "")}>
      <div className="hero-story-people">
        {story.pair.map((person, i) => <Image key={person} src={"/avatars/avatar-" + people[person].image + ".jpg"} alt="" width={44} height={44} className={i ? "hero-story-avatar second" : "hero-story-avatar"} />)}
        {!compact && <span className="hero-pair-mark"><Check size={10} strokeWidth={3} /></span>}
      </div>
      <div className="hero-story-copy"><p>{story.title}</p>{!compact && <span>{story.detail}</span>}</div>
      <Icon className="hero-story-icon" strokeWidth={1.6} />
    </div>
  );
}

export default function Hero() {
  const { paused } = useMotionPreference();
  const root = useRef<HTMLElement>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 45, damping: 25 });
  const y = useSpring(pointerY, { stiffness: 45, damping: 25 });
  const move = (event: PointerEvent<HTMLElement>) => {
    if (paused || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX / rect.width - .5) * 22);
    pointerY.set(((event.clientY - rect.top) / rect.height - .5) * 16);
  };

  return (
    <section ref={root} id="top" className="hero-section relative isolate overflow-hidden" onPointerMove={move} onPointerLeave={() => { pointerX.set(0); pointerY.set(0); }}>
      <div className="hero-atmosphere" aria-hidden="true">
        <GradientFloor className="hero-aurora" colors={["var(--primary)", "var(--secondary)", "var(--lime)"]} speed={paused ? 0 : 9} />
        <div className="hero-glow hero-glow-left" /><div className="hero-glow hero-glow-right" />
        <GridBackground className="hero-grid-v2" size={56} speed={paused ? 0 : 16} color="color-mix(in srgb, var(--primary) 7%, transparent)" fade={90} reveal={false} />
      </div>
      <div className="hero-stage">
        <HeroBeams />
        <motion.div className="hero-messages" style={{ x: paused ? 0 : x, y: paused ? 0 : y }} aria-hidden="true">
          {lanes.map((lane, i) => <KitMarquee key={i} speed={lane.speed} reverse={i % 2 === 1} phase={lane.phase} className={"hero-lane hero-lane-" + i}>
            {lane.items.map(index => <StoryCard key={index} index={index} compact={lane.compact} />)}
          </KitMarquee>)}
        </motion.div>
        <div className="hero-quiet-zone" aria-hidden="true" />
        <div className="hero-content relative z-10 mx-auto flex max-w-[940px] flex-col items-center px-5 text-center">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }} className="hero-invitation">
            <span className="hero-live-dot" aria-hidden="true" />
            <span>有想法，就差一个同频的人</span>
            <ArrowRight size={13} />
          </motion.div>
          <h1 className="hero-title font-heading font-semibold">
            <span className="hero-title-first"><TextReveal text="你的下一个队友，" by="char" as="span" stagger={45} duration={850} delay={80} /></span>
            <span className="hero-title-second">
              <GradientText colors={["var(--primary)", "var(--night)", "var(--primary)", "var(--primary)"]} speed={7}>也在找你。</GradientText>
              <motion.svg viewBox="0 0 430 18" preserveAspectRatio="none" className="hero-underline" aria-hidden="true"><motion.path d="M5 12 Q210 2 425 11" fill="none" stroke="var(--lime)" strokeWidth="9" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, delay: .7 }} /></motion.svg>
              <span className="hero-title-spark" aria-hidden="true"><Sparkles strokeWidth={1.3} /></span>
            </span>
          </h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .8, delay: .55 }} className="hero-description">
            你有想法，这里有人愿意一起做。<br />
            技能互补，方向合拍，相遇在同一场活动。
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, delay: .65 }} className="hero-actions">
            <Button asChild size="xl" className="hero-primary group"><a href="#recommendations">遇见我的队友<ArrowRight className="transition-transform group-hover:translate-x-1" /></a></Button>
            <Button asChild variant="outline" size="xl" className="hero-secondary group"><a href="#people">看看故事怎么开始<ArrowDown className="transition-transform group-hover:translate-y-1" /></a></Button>
          </motion.div>
          <div className="hero-assurances"><span><Check size={14} />在同一场活动相遇</span><span><Sparkles size={14} />让 AI 帮你找到共同语言</span></div>
        </div>
        <div className="hero-proof relative z-10 mx-auto text-center">
          <div className="hero-proof-people">{people.slice(0,5).map((person, i) => <span key={person.name} style={{ "--avatar-delay": i * -.7 + "s" } as CSSProperties}><Image src={"/avatars/avatar-" + person.image + ".jpg"} alt="" width={36} height={36} /></span>)}<span className="hero-proof-note">一个人的灵感，一群人的作品</span></div>
          <p>组队故事与人物为演示 · 试着悬停，让故事慢下来</p>
          <a href="#people" className="hero-scroll" aria-label="继续了解队友"><span>向下，遇见更多可能</span><ArrowDown size={16} /></a>
        </div>
      </div>
    </section>
  );
}
