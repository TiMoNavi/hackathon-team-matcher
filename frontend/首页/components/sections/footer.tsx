"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Plus, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { KineticHeading } from "@/components/effects/kinetic-heading";
import { TiltCard } from "@/components/effects/tilt-card";
import { BlurCrossfade } from "@/components/effects/blur-crossfade";
import { useMotionPreference } from "@/components/motion-preference";
import { people } from "@/lib/people";

// Kit cta6: centered invitation above an alternating-width, offset portrait row.
// Local composition: AffectUI TiltCard / BlurCrossfade with Signalry tokens.
const invitations = [
  "我来写界面，一起把想法变成能用的东西。",
  "我来接 AI，你来决定它能帮谁。",
  "我来想体验，一起把每个细节做好。",
  "先做一个小版本？我今晚就能开工。",
  "想试一点好玩的交互，刚好缺个搭档。",
  "后端交给我，我们把这个点子跑起来。",
];

export default function Footer() {
  const [selected, setSelected] = useState(0);
  const { paused } = useMotionPreference();
  return <footer id="invitation" className="invitation-section page-section" data-paused={paused || undefined}>
    <div className="invitation-wash" aria-hidden="true" />
    <div className="section-container relative">
      <header className="invitation-heading mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="invitation-kicker"><Sparkles size={14} aria-hidden /> 下一段故事，留一个位置给你</span>
        <KineticHeading first="好想法，" second="就差你们一起做。" />
        <p className="mt-6 max-w-[540px] text-base leading-8 text-muted-foreground">带上你的技能，和那个一直想试试的点子。<br className="hidden sm:block" />剩下的一半，也许就在同一场活动里。</p>
        <div className="invitation-actions mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="xl" className="hero-primary"><a href="#recommendations">遇见我的队友<ArrowRight /></a></Button>
          <Button asChild size="xl" variant="secondary"><a href="#profile">先介绍一下我<ArrowUpRight /></a></Button>
        </div>
      </header>
      <div className="invitation-quote" aria-live="polite" aria-atomic="true">
        <BlurCrossfade id={selected} duration={paused ? 0 : 420} blur={6} morph="none">
          <p><span>{people[selected].name}</span>「{invitations[selected]}」</p>
        </BlurCrossfade>
      </div>
      <div className="invitation-portraits" aria-label="听听示例伙伴的邀请" data-no-page-turn>
        {people.map((person, index) => <div key={person.name} className="invitation-portrait-slot" style={{ "--portrait-delay": `${index * -.85}s`, "--portrait-angle": `${[-7,4,-3,5,-5,7][index]}deg` } as CSSProperties}>
          <div className="invitation-portrait-float">
            <TiltCard className="invitation-tilt" maxTilt={paused ? 0 : 8} scale={paused ? 1 : 1.025} glare={!paused}>
              <button type="button" className="invitation-person" aria-label={"听听" + person.name + "的邀请"} aria-pressed={selected === index} onPointerEnter={event => { if (event.pointerType === "mouse") setSelected(index); }} onFocus={() => setSelected(index)} onClick={() => setSelected(index)}>
                <Image src={"/avatars/avatar-" + person.image + ".jpg"} alt="" width={160} height={180} className="invitation-portrait-image" />
                <span className="invitation-person-caption"><strong>{person.name}</strong><span>{person.role}</span></span>
                <span className="invitation-person-dot" aria-hidden="true" />
              </button>
            </TiltCard>
          </div>
          {index === 2 && <a href="#profile" className="invitation-your-place"><Plus size={22} aria-hidden /><strong>你的位置</strong><span>等你来介绍</span></a>}
        </div>)}
      </div>
      <p className="invitation-hint">悬停或点选，听听他们想做什么 · 均为演示人物</p>
      <div className="invitation-bottom"><Brand /><p>从相遇，到一起做出来。</p><a href="#top">再看一遍<ArrowUpRight size={15} /></a></div>
      <p className="invitation-demo">独立设计预览 · 资料、推荐和互动均为演示</p>
    </div>
  </footer>;
}
