"use client";

// Adapted from Signalry's Features spacing and HeroDashboard three-column shell.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Clock3,
  Code2,
  Heart,
  Lightbulb,
  MapPin,
  Pause,
  Play,
  Sparkles,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMotionPreference } from "@/components/motion-preference";
import { TiltCard } from "@/components/effects/tilt-card";
import { BlurCrossfade } from "@/components/effects/blur-crossfade";
import { KineticHeading } from "@/components/effects/kinetic-heading";
import { MaterialSurface } from "@/components/effects/material-surface";

const people = [
  {
    name: "林小满",
    english: "Xiaoman",
    image: "/avatars/avatar-1.jpg",
    role: "前端开发",
    location: "上海",
    intro: "把复杂的问题，做成简单好用的界面。",
    skills: ["React", "TypeScript", "前端交互"],
    looking: "对 AI 应用感兴趣的搭档",
    project: "一个能听懂碎碎念的旅行助手",
    projectIntro: "把「想找个安静的小店坐坐」这样的随口一说，变成一段刚好适合你的行程。",
    projectTag: "AI + 旅行",
    contribution: "我来做界面和地图交互",
    need: "一起打通 AI 理解与规划",
    time: "周末两天，全程投入",
    evidence: "做过可交互的旅行路线原型",
    reasons: [
      { title: "让能力接得起来", text: "小满擅长 React 与界面交互，期待和熟悉 AI 应用的你一起打通完整体验。" },
      { title: "关心同一种体验", text: "你们都想让 AI 解决日常的小麻烦，旅行是一个可以马上试试的场景。" },
      { title: "留得出一起做的时间", text: "小满可以投入整个周末，适合先和你完成一个能现场演示的小版本。" },
    ],
    opener: "如果旅行助手能听懂一句话，你最想对它说什么？",
  },
  {
    name: "许知夏",
    english: "Zoe",
    image: "/avatars/avatar-3.jpg",
    role: "产品设计",
    location: "杭州",
    intro: "在意每一次点击，也在意屏幕另一边的人。",
    skills: ["Figma", "用户研究", "交互设计"],
    looking: "愿意一起打磨体验的开发者",
    project: "给独居生活，多一点安心",
    projectIntro: "做一个轻量的日常报平安工具，让一个人生活的人，在需要时能联系到信任的朋友。",
    projectTag: "日常陪伴",
    contribution: "我来梳理需求和交互流程",
    need: "一起把原型做成可用产品",
    time: "本次活动全程参与",
    evidence: "有从用户访谈到交互原型的经验",
    reasons: [
      { title: "刚好补上彼此的一块", text: "你负责工程实现，知夏擅长研究与交互，可以一起把模糊的想法做清楚。" },
      { title: "从一个真实需求开始", text: "你们都希望做一个真的有人会用的小产品，而不止是一段技术展示。" },
      { title: "可以一起打磨细节", text: "知夏全程参加这次活动，有时间与你并肩试用、讨论和改进。" },
    ],
    opener: "关于一个人生活，你最想先解决哪个小麻烦？",
  },
  {
    name: "唐可",
    english: "Keke",
    image: "/avatars/avatar-5.jpg",
    role: "创意开发",
    location: "苏州",
    intro: "让代码有一点好玩，也有一点温度。",
    skills: ["Three.js", "Web", "互动体验"],
    looking: "视觉设计和声音创作伙伴",
    project: "把城市里的声音，种成花园",
    projectIntro: "收集风声、车流和街角的日常，让每一段声音长成可以触碰的小景观。",
    projectTag: "声音 × 互动",
    contribution: "我来实现 Web 互动和动效",
    need: "一起探索视觉与声音表达",
    time: "两天活动，晚上也可以聊",
    evidence: "做过基于 Three.js 的互动作品",
    reasons: [
      { title: "给想象找一个出口", text: "你的视觉或声音想法，可以和唐可的创意开发经验一起变成可交互的作品。" },
      { title: "都愿意试一点新东西", text: "你们关注的不只是功能，也希望作品能让人停下来，多感受一会儿。" },
      { title: "有相近的协作节奏", text: "唐可愿意在活动之外继续讨论，适合和你边做边试，把细节慢慢磨出来。" },
    ],
    opener: "如果给这座城市留下一段声音，你会选哪一段？",
  },
] as const;

export default function Recommendations() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [autoplay, setAutoplay] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [interested, setInterested] = useState<string[]>([]);
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { amount: 0.3 });
  const { reduced: reducedMotion, paused: globalPaused } = useMotionPreference();
  const motionPaused = Boolean(reducedMotion) || globalPaused;
  const person = people[index];
  const liked = interested.includes(person.name);
  const playing = autoplay && !hovered && !focused && !motionPaused && inView;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (document.hidden || document.documentElement.dataset.motion === "paused") return;
      setDirection(1);
      setIndex((current) => (current + 1) % people.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [playing]);

  function selectPerson(next: number, nextDirection = 1) {
    setAutoplay(false);
    setDirection(nextDirection);
    setIndex((next + people.length) % people.length);
  }

  function toggleInterest() {
    setAutoplay(false);
    setInterested((current) =>
      liked ? current.filter((name) => name !== person.name) : [...current, person.name],
    );
  }

  return (
    <section
      ref={sectionRef}
      id="recommendations"
      aria-labelledby="recommendations-heading"
      data-paused={motionPaused || undefined}
      className="recommendations-section flex w-full scroll-mt-24 justify-center bg-background px-5 py-16 md:px-10 md:py-20 lg:px-24 lg:py-[120px]"
    >
      <div className="flex w-full max-w-[1248px] flex-col gap-12 md:gap-16">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <Badge variant="secondary" className="mb-5 h-auto gap-1.5 px-3 py-1.5">
              <Sparkles aria-hidden="true" />
              找到队友，也知道为什么
            </Badge>
            <KineticHeading id="recommendations-heading" first="有些合拍，" second="值得展开聊聊。" />
          </div>
          <p className="max-w-[410px] text-base leading-[1.75] text-muted-foreground md:text-lg">
            认识一个人，也看看 TA 正在做什么。
            AI 帮你找到技能、兴趣和时间上的交集，最后的选择留给你。
          </p>
        </div>

        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
          }}
          className="recommendation-stage min-w-0 text-base"
        >
          <div className="recommendation-toolbar mb-6 flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <span className="size-2 rounded-full bg-primary" />周末造物场
              </span>
              <span className="text-muted-foreground">当前活动内推荐 · 演示数据</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={motionPaused}
              className="h-9 shrink-0 gap-1.5 text-xs text-muted-foreground"
              aria-label={motionPaused ? "全站动效已暂停，可手动浏览推荐人选" : autoplay ? "暂停自动切换推荐人选" : "自动切换推荐人选"}
              onClick={() => setAutoplay((current) => !current)}
            >
              {autoplay && !motionPaused ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {motionPaused ? "手动浏览" : autoplay ? "暂停轮播" : "自动浏览"}
            </Button>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.15fr)_minmax(0,.9fr)] lg:gap-7 xl:gap-10">
            <div className="recommendation-deck min-w-0 px-3 pt-4 pb-2">
              <div className="relative mx-auto max-w-[330px] pt-3">
                <div aria-hidden="true" className="absolute inset-x-3 top-2 bottom-2 rotate-[-4deg] rounded-[24px] bg-primary/8" />
                <div aria-hidden="true" className="absolute inset-x-1 top-3 bottom-1 rotate-[3deg] rounded-[24px] bg-background/65 shadow-sm" />
                <AnimatePresence initial={false} mode="wait" custom={direction}>
                  <motion.div
                    key={person.name}
                    custom={direction}
                    variants={{
                      enter: (travel: number) => ({ opacity: 0, x: motionPaused ? 0 : travel * 55, rotate: motionPaused ? 0 : travel * 4 }),
                      center: { opacity: 1, x: 0, rotate: 0 },
                      exit: (travel: number) => ({ opacity: 0, x: motionPaused ? 0 : travel * -55, rotate: motionPaused ? 0 : travel * -4 }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: motionPaused ? 0 : 0.25 }}
                    drag={motionPaused ? false : "x"}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.6}
                    dragSnapToOrigin
                    onDragEnd={(_, info) => {
                      if (Math.abs(info.offset.x) > 55) selectPerson(index + (info.offset.x < 0 ? 1 : -1), info.offset.x < 0 ? 1 : -1);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                        event.preventDefault();
                        selectPerson(index + (event.key === "ArrowRight" ? 1 : -1), event.key === "ArrowRight" ? 1 : -1);
                      }
                    }}
                    tabIndex={0}
                    role="group"
                    aria-label={`${person.name}的人物卡片，可用左右方向键切换`}
                    className="relative touch-pan-y rounded-[24px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <TiltCard className="recommendation-tilt w-full" maxTilt={motionPaused ? 0 : 5} scale={motionPaused ? 1 : 1.015} glare={!motionPaused} perspective={1000}>
                    <div className="relative isolate flex min-h-[390px] flex-col items-center bg-background px-5 pt-8 pb-6 text-center">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-44 overflow-hidden rounded-t-[24px] bg-linear-to-b from-secondary to-background">
                      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(var(--primary) .6px, transparent .6px)", backgroundSize: "14px 14px", maskImage: "linear-gradient(to bottom, black, transparent)" }} />
                      <span className="absolute top-8 left-5 flex size-8 rotate-[-12deg] items-center justify-center rounded-xl border border-primary/10 bg-background/80 text-primary/60"><Code2 className="size-4" /></span>
                      <span className="absolute top-11 right-5 flex size-7 rotate-[12deg] items-center justify-center rounded-lg border border-primary/10 bg-lime/70 text-primary"><Sparkles className="size-3.5" /></span>
                    </div>
                    <Avatar className="relative mb-5 size-[104px] shadow-[0_12px_24px_-12px_color-mix(in_srgb,var(--primary)_40%,transparent)] ring-[7px] ring-background after:hidden">
                      <AvatarImage src={person.image} alt="" className="object-cover" draggable={false} />
                      <AvatarFallback className="bg-secondary text-3xl font-semibold text-primary">{person.name.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <h3 className="font-heading text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">{person.name}</h3>
                    <p className="mt-1.5 text-[13px] text-muted-foreground">{person.role} <span aria-hidden="true">·</span> {person.location}</p>
                    <p className="mt-5 max-w-[260px] text-sm leading-6 text-body">“{person.intro}”</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                      {person.skills.map((skill) => <Badge key={skill} variant="secondary" className="h-auto px-2 py-1 text-[11px]">{skill}</Badge>)}
                    </div>
                    <div className="recommendation-looking mt-6 w-full pt-4">
                      <p className="mb-1 text-[11px] text-muted-foreground">这次活动，我在找</p>
                      <p className="text-[13px] font-medium text-foreground">{person.looking}</p>
                    </div>
                    </div>
                    </TiltCard>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mx-auto mt-6 flex max-w-[330px] items-center justify-between gap-2">
                <Button variant="outline" size="icon-lg" aria-label="上一位队友" onClick={() => selectPerson(index - 1, -1)} className="size-11 rounded-full border-0 bg-background/80 shadow-none hover:bg-background"><ArrowLeft /></Button>
                <Button variant={liked ? "secondary" : "default"} onClick={toggleInterest} aria-pressed={liked} className="h-11 min-w-0 flex-1 gap-1.5 rounded-xl px-2.5 text-[13px] sm:flex-none sm:gap-2 sm:px-5 sm:text-sm">
                  <Heart className={cn(liked && "fill-current")} aria-hidden="true" />{liked ? "已标记兴趣" : "感兴趣"}
                </Button>
                <Button variant="outline" size="icon-lg" aria-label="下一位队友" onClick={() => selectPerson(index + 1)} className="size-11 rounded-full border-0 bg-background/80 shadow-none hover:bg-background"><ArrowRight /></Button>
              </div>
              <div className="mt-3 flex items-center justify-center gap-1" aria-label="选择推荐人选">
                {people.map((candidate, candidateIndex) => (
                  <button
                    key={candidate.name}
                    type="button"
                    aria-label={`查看${candidate.name}`}
                    aria-pressed={index === candidateIndex}
                    onClick={() => selectPerson(candidateIndex, candidateIndex >= index ? 1 : -1)}
                    className="flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className={cn("h-1.5 rounded-full transition-all", index === candidateIndex ? "w-5 bg-primary" : "w-1.5 bg-primary/20")} />
                  </button>
                ))}
              </div>
              <p className="min-h-9 text-center text-[11px] leading-[18px] text-muted-foreground" role="status" aria-live="polite">
                {liked ? "演示已标记，未发送好友申请。" : "左右滑动卡片，发现另一种可能。"}
              </p>
            </div>

            <div className="recommendation-story min-w-0 px-2 py-5 sm:px-4 lg:px-0 lg:py-7">
              <BlurCrossfade id={person.name} duration={motionPaused ? 0 : 440} blur={motionPaused ? 0 : 7} morph="none" className="h-full [&>.ui-bx__layer]:h-full">
                <div className="flex h-full min-w-0 flex-col">
                  <div className="mb-5 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Lightbulb className="size-4 text-primary" aria-hidden="true" />TA 正在想的事</div>
                  <Badge variant="secondary" className="mb-4 h-auto w-fit rounded-full px-3 py-1.5 text-[11px] font-normal">{person.projectTag}</Badge>
                  <h3 className="font-heading text-[24px] leading-[1.4] font-semibold tracking-[-0.02em]">{person.project}</h3>
                  <p className="mt-4 text-sm leading-[1.9] text-body">{person.projectIntro}</p>
                  <div className="recommendation-exchange my-7 grid grid-cols-1 gap-3 py-2">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><Code2 className="size-4" aria-hidden="true" /></span>
                      <div><p className="mb-1.5 text-[11px] text-muted-foreground">TA 可以带来</p><p className="text-[13px] font-medium leading-5">{person.contribution}</p></div>
                    </div>
                    <div className="ml-3.5 text-primary/35"><ArrowDown className="size-3" aria-hidden="true" /></div>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-lime text-foreground"><Users className="size-4" aria-hidden="true" /></span>
                      <div><p className="mb-1.5 text-[11px] text-muted-foreground">期待和你一起</p><p className="text-[13px] font-medium leading-5">{person.need}</p></div>
                    </div>
                  </div>
                  <dl className="flex flex-col gap-5 text-[12px]">
                    <div className="flex gap-3"><Clock3 className="mt-0.5 size-4 shrink-0 text-primary/65" aria-hidden="true" /><div><dt className="text-muted-foreground">可投入时间</dt><dd className="mt-1 font-medium leading-5 text-body">{person.time}</dd></div></div>
                    <div className="flex gap-3"><CheckCheck className="mt-0.5 size-4 shrink-0 text-primary/65" aria-hidden="true" /><div><dt className="text-muted-foreground">项目经历</dt><dd className="mt-1 font-medium leading-5 text-body">{person.evidence}</dd></div></div>
                  </dl>
                  <p className="mt-auto flex items-center gap-1.5 pt-7 text-[11px] text-muted-foreground"><MapPin className="size-3" aria-hidden="true" />你们都在「周末造物场」</p>
                </div>
              </BlurCrossfade>
            </div>

            <MaterialSurface className="recommendation-reasons min-w-0">
            <aside className="relative flex h-full min-w-0 flex-col rounded-[24px] bg-muted p-6 text-foreground sm:p-8 lg:p-6 xl:p-7" aria-label="AI 推荐理由">
              <div aria-hidden className="pointer-events-none absolute -top-12 right-0 size-44 rounded-full bg-primary/10 blur-[55px]" />
              <div className="relative mb-8 flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-lime text-night"><Sparkles className="size-[19px]" aria-hidden="true" /></span>
                <div><h3 className="text-sm font-semibold leading-6">为什么想让你们认识</h3><p className="mt-0.5 text-[11px] text-muted-foreground">AI 推荐理由 · 示例</p></div>
              </div>
              <BlurCrossfade id={person.name} duration={motionPaused ? 0 : 460} blur={motionPaused ? 0 : 6} morph="none" className="relative flex-1 [&>.ui-bx__layer]:h-full">
                <div className="flex h-full flex-col">
                  <div className="flex flex-col gap-7">
                    {person.reasons.map((reason) => (
                      <div key={reason.title} className="flex items-start gap-3">
                        <span className="mt-1 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><Check className="size-3" aria-hidden="true" /></span>
                        <div><h4 className="text-[13px] font-semibold leading-6 text-foreground">{reason.title}</h4><p className="mt-2 text-[13px] leading-[23px] text-body sm:text-[12px] sm:leading-[22px]">{reason.text}</p></div>
                      </div>
                    ))}
                  </div>
                  <div className="recommendation-opener mt-8 pl-4">
                    <p className="mb-2.5 text-[11px] font-medium text-primary">不如从这句话开始</p>
                    <p className="text-[13px] leading-[23px] text-body sm:text-[12px] sm:leading-[22px]">“{person.opener}”</p>
                  </div>
                  <p className="mt-auto pt-6 text-[11px] leading-5 text-muted-foreground">基于已确认资料与本次活动偏好。<br />理由供你参考，合不合拍，聊过才知道。</p>
                </div>
              </BlurCrossfade>
            </aside>
            </MaterialSurface>
          </div>
        </div>
      </div>
      <style>{".recommendations-section .recommendation-tilt { display: block; --ui-tc-radius: 24px; --ui-tc-shadow: 0 6px 14px -10px color-mix(in srgb,var(--night) 18%,transparent), 0 20px 36px -25px color-mix(in srgb,var(--primary) 38%,transparent); --ui-tc-shadow-active: 0 12px 20px -15px color-mix(in srgb,var(--night) 22%,transparent), 0 28px 44px -22px color-mix(in srgb,var(--primary) 40%,transparent); } .recommendations-section[data-paused] .ui-tc-card { transform: none; transition: none; } .recommendations-section[data-paused] .ui-gt__fill { animation-play-state: paused; } .recommendations-section[data-paused] .ui-gt__fill, .recommendations-section[data-paused] .ui-gt__base { transition: none; } .recommendations-section[data-paused] .ui-bx__layer--out { display: none; } .recommendations-section[data-paused] .ui-bx__layer--in { animation: none; }"}</style>
    </section>
  );
}
