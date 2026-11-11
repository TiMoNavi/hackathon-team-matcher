"use client";

// Composes Signalry's integrations orbit, feature-card proportions, and AI panel
// with its original shadcn primitives. All source material below is demo data.
import { useState } from "react";
import {
  ArrowRight, Check, CheckCheck, Code2, Eye, FileText,
  Globe, LockKeyhole, Sparkles, UserRound, WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { AnimatedSelection } from "@/components/effects/animated-selection";
import { MaterialSurface } from "@/components/effects/material-surface";
import { KineticHeading } from "@/components/effects/kinetic-heading";
import { BlurCrossfade } from "@/components/effects/blur-crossfade";
import { ProfileOrbit } from "@/components/effects/profile-orbit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useMotionPreference } from "@/components/motion-preference";
import { cn } from "@/lib/utils";

const sources = [
  {
    id: "github", name: "GitHub", label: "从代码认识你", icon: Code2,
    title: "把想法写成代码的人",
    intro: "喜欢做小而完整的产品。能写前端，也愿意把 API 和部署一起接起来。",
    skills: ["React", "TypeScript", "Python"],
    project: "做过一个开源读书助手",
    detail: "从页面交互到检索接口，参与了完整开发。",
    preference: "想找一位对产品和设计有想法的队友",
    evidence: "示例公开仓库 · 项目说明与技术栈",
  },
  {
    id: "resume", name: "个人简历", label: "经历也有故事", icon: FileText,
    title: "把复杂问题讲清楚的人",
    intro: "做过数据产品，也参加过黑客松。习惯先理解问题，再和队友一起做出能用的版本。",
    skills: ["数据分析", "产品设计", "快速原型"],
    project: "和朋友做过校园闲置地图",
    detail: "负责需求访谈、原型和最终作品演示。",
    preference: "希望和工程队友一起打磨一个实用工具",
    evidence: "示例简历 · 项目经历与协作角色",
  },
  {
    id: "portfolio", name: "作品网站", label: "看见你的热爱", icon: Globe,
    title: "在细节里认真表达的人",
    intro: "在意一个产品用起来的感觉。喜欢有趣的界面，也喜欢把体验做得简单、顺手。",
    skills: ["交互设计", "Figma", "前端动效"],
    project: "设计过一款专注计时工具",
    detail: "从视觉语言到动效，让小工具多一点温度。",
    preference: "想和愿意尝试新交互的开发者合作",
    evidence: "示例作品集 · 作品介绍与设计记录",
  },
] as const;

type SourceId = (typeof sources)[number]["id"];

function ProfileDetail({ icon: Icon, label, children }: {
  icon: LucideIcon; label: string; children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
        {children}
      </div>
    </div>
  );
}

export default function Profile() {
  const [sourceId, setSourceId] = useState<SourceId>("github");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [visibility, setVisibility] = useState("authenticated");
  const { paused, reduced: reducedMotion } = useMotionPreference();
  const source = sources.find((item) => item.id === sourceId)!;

  function selectSource(id: SourceId) {
    setSourceId(id);
    setConfirmed(false);
  }

  return (
    <section id="profile" data-profile-motion={paused ? "paused" : "running"} aria-labelledby="profile-title" className="profile-section w-full bg-background px-5 py-16 md:px-10 md:py-20 lg:px-24 lg:py-[120px]">
      <div className="mx-auto flex max-w-[1248px] flex-col gap-10 md:gap-14">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <Badge variant="secondary" className="mb-5 h-auto gap-1.5 px-3 py-1 text-xs">
              <Sparkles className="size-3.5" aria-hidden /> AI 画像助手
            </Badge>
            <KineticHeading id="profile-title" first="你认真做过的事，" second="值得被看见。" />
          </div>
          <div className="max-w-[440px]">
            <p className="text-base leading-[1.75] text-muted-foreground md:text-lg">
              你写过的代码、做过的项目、认真打磨的作品，<br className="hidden xl:block" />都比一张空白表单更懂你。把它们交给 AI，<br className="hidden xl:block" />一起整理出真实、鲜活的自我介绍。
            </p>
            <Button variant="link" onClick={() => setPreviewOpen(true)} className="mt-3 h-11 px-0 text-base font-semibold">
              预览我的画像 <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-5 lg:flex-row">
          <div className="profile-scene relative flex min-w-0 flex-col overflow-hidden rounded-[24px] lg:w-[64%]">
            <div className="relative z-10 flex items-center gap-2 px-6 pt-6 text-[13px] text-muted-foreground md:px-8 md:pt-7">
              <span className="size-1.5 rounded-full bg-primary" /> 从你已有的故事开始
            </div>
            <ProfileOrbit activeSource={sourceId} />
            <div className="relative z-10 mt-auto grid grid-cols-3 gap-2 px-4 pb-5 sm:gap-3 sm:px-8">
              <AnimatedSelection value={sourceId}>{sources.map((item) => (
                <button
                  key={item.id}
                  data-id={item.id}
                  type="button"
                  aria-pressed={sourceId === item.id}
                  aria-label={"查看" + item.name + "示例画像"}
                  onClick={() => selectSource(item.id)}
                  className={cn("profile-source flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-2xl px-2 py-3 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:min-h-[82px] sm:flex-row sm:gap-3 sm:text-left",
                    sourceId === item.id ? "text-primary-foreground" : "bg-card/65 text-foreground hover:bg-card")}
                >
                  <item.icon className="size-5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap text-[11px] font-semibold sm:text-sm">{item.name}</span>
                    <span className={cn("mt-1 hidden text-[11px] sm:block", sourceId === item.id ? "text-primary-foreground/75" : "text-muted-foreground")}>{item.label}</span>
                  </span>
                </button>
              ))}</AnimatedSelection>
            </div>
            <p className="pb-6 text-center text-[11px] text-muted-foreground">点选一份示例资料，看看 AI 会怎样介绍你</p>
          </div>

          <MaterialSurface className="profile-material min-w-0 lg:w-[36%]">
          <div className="profile-preview flex min-w-0 flex-col rounded-[24px] bg-card p-6 md:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2 pb-1">
              <span className="flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4 text-primary" aria-hidden /> 我的画像</span>
              <Badge variant="secondary" className="font-normal">{confirmed ? "已确认 · 演示" : "待你确认 · 演示"}</Badge>
            </div>
            <BlurCrossfade id={sourceId} duration={paused || reducedMotion ? 0 : 420} blur={8} morph="height" className="flex-1">
              <div className="flex flex-col" aria-live="polite">
                <p className="mb-2 text-xs font-medium text-primary">Hi，我是小林</p>
                <h3 className="font-heading text-[24px] font-semibold leading-[1.35] tracking-[-0.02em]">{source.title}</h3>
                <p className="mb-6 mt-3 text-sm leading-6 text-muted-foreground">{source.intro}</p>
                <div className="space-y-5">
                  <ProfileDetail icon={Code2} label="我能带来的">
                    <div className="flex flex-wrap gap-1.5">{source.skills.map((skill) => <Badge key={skill} variant="secondary" className="border-0 bg-muted font-normal">{skill}</Badge>)}</div>
                  </ProfileDetail>
                  <ProfileDetail icon={FileText} label="我做过的">
                    <p className="text-sm font-medium leading-5">{source.project}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{source.detail}</p>
                  </ProfileDetail>
                  <ProfileDetail icon={WandSparkles} label="这次想遇见">
                    <p className="text-sm leading-6">{source.preference}</p>
                  </ProfileDetail>
                </div>
                <p className="mb-4 mt-6 flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground"><source.icon className="mt-0.5 size-3 shrink-0" aria-hidden />{source.evidence}</p>
              </div>
            </BlurCrossfade>
            <Button variant="secondary" className="mt-auto h-11 w-full rounded-xl text-sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="size-4" aria-hidden /> 预览并确认
            </Button>
          </div>
          </MaterialSurface>
        </div>

        <div className="flex flex-col items-start justify-between gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <p className="flex items-start gap-2 leading-6"><LockKeyhole className="mt-1 size-4 shrink-0 text-primary" aria-hidden />AI 帮你整理，展示什么、给谁看，始终由你决定。</p>
          <span className="shrink-0 text-xs">示例资料演示，不会读取你的账号或文件</span>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[24px] sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl leading-8">这段介绍，像你吗？</DialogTitle>
            <DialogDescription className="leading-6">这是基于{source.name}示例资料的画像。实际使用时，你可以修改内容，并逐条决定可见范围。</DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl bg-muted p-5">
            <p className="mb-2 font-semibold">{source.title}</p>
            <p className="text-sm leading-6 text-body">{source.intro}</p>
            <div className="mt-4 flex flex-wrap gap-2">{source.skills.map((skill) => <Badge key={skill} variant="secondary">{skill}</Badge>)}</div>
          </div>
          <label htmlFor="profile-demo-visibility" className="text-sm font-medium">这段介绍给谁看</label>
          <select id="profile-demo-visibility" value={visibility} onChange={(event) => { setVisibility(event.target.value); setConfirmed(false); }} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <option value="authenticated">登录用户可见</option>
            <option value="friends">好友可见</option>
            <option value="private">仅自己可见</option>
          </select>
          <p className="text-xs leading-5 text-muted-foreground">原始资料保持私密；只有你确认的介绍才按所选范围展示。</p>
          <Button size="xl" onClick={() => setConfirmed(true)} disabled={confirmed} className="w-full">
            {confirmed ? <CheckCheck aria-hidden /> : <Check aria-hidden />}
            {confirmed ? "已确认这段示例介绍" : "确认这段介绍（演示）"}
          </Button>
          <p className="min-h-5 text-center text-xs text-muted-foreground" role="status">
            {confirmed ? "仅更新本页演示状态，没有保存或公开任何资料。" : "你可以随时切换资料来源，重新预览。"}
          </p>
        </DialogContent>
      </Dialog>
      <style>{`
        .profile-scene { background: radial-gradient(ellipse at 50% 48%,var(--secondary),var(--muted) 48%,var(--background) 78%); }
        .profile-source { backdrop-filter: blur(16px); }
        .profile-section[data-profile-motion="paused"] .ui-gt__fill { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .profile-section .ui-gt__fill { animation: none; } }
      `}</style>
    </section>
  );
}
