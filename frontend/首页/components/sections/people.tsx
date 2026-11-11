"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight, Check, Clock3, MapPin, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RoleWheel } from "@/components/effects/role-wheel";
import { KineticHeading } from "@/components/effects/kinetic-heading";
import { useMotionPreference } from "@/components/motion-preference";
import { people, type Person } from "@/lib/people";
import { cn } from "@/lib/utils";

// Shadcn UI Kit testimonial4: split intro + two masked, looping columns.
// Signalry supplies the lavender/white surfaces, spacing and shadow scale.
function PeopleColumn({ entries, reverse, onSelect }: {
  entries: Person[];
  reverse?: boolean;
  onSelect: (person: Person) => void;
}) {
  return (
    <div className="people-column min-w-0 flex-1">
      <div className={cn("people-track", reverse && "people-track-reverse")}>
        {[0, 1].map((copy) => (
          <div className="people-group" key={copy} aria-hidden={copy === 1 || undefined}>
            {entries.map((person, index) => (
              <Card
                key={person.name}
                className={cn(
                  "people-person-card group relative gap-0 overflow-hidden rounded-[24px] border-0 py-0 ring-0 transition-shadow duration-300",
                  index % 2 === 0 ? "bg-background" : "bg-muted",
                )}
              >
                <CardContent className="relative p-5 sm:p-6">
                  <div aria-hidden className="pointer-events-none absolute -top-12 -right-10 size-40 rounded-full bg-secondary/45 blur-2xl" />
                  <div className="relative flex items-center gap-3">
                    <div className="relative shrink-0">
                      <Image src={"/avatars/avatar-" + person.image + ".jpg"} alt="" width={56} height={56} className="size-14 rounded-[18px] object-cover ring-4 ring-background shadow-sm" />
                      <span className="absolute -right-1 -bottom-1 size-3.5 rounded-full border-[3px] border-background bg-lime" aria-label="演示人物" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-foreground">{person.name}</h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground"><span>{person.role}</span><span className="font-heading text-[11px] opacity-70">{person.english}</span></p>
                    </div>
                  </div>
                  <p className="relative mt-5 text-[13px] leading-[1.9] text-body">{person.about}</p>
                  <div className="people-skills mt-4 flex flex-wrap gap-1.5">
                    {person.tag.split(" / ").map((tag) => <Badge key={tag} variant="secondary" className={cn("h-auto rounded-full px-2.5 py-1 text-[11px] font-medium", index % 2 !== 0 && "bg-background text-body")}>{tag}</Badge>)}
                  </div>
                  <div className="people-looking mt-5 pt-4">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-primary"><Sparkles className="size-3" aria-hidden />这次活动，期待遇见</p>
                    <p className="text-xs leading-5 text-body">{person.looking}</p>
                  </div>
                  <button
                    type="button"
                    tabIndex={copy === 1 ? -1 : 0}
                    onClick={() => onSelect(person)}
                    className="mt-3 flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-1 text-left text-xs font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    认识一下{person.name}
                    <span className="flex size-7 items-center justify-center rounded-full bg-secondary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><ArrowRight className="size-3.5" aria-hidden /></span>
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function People() {
  const [selected, setSelected] = useState<Person | null>(null);
  const [interested, setInterested] = useState(false);
  const { paused } = useMotionPreference();
  function select(person: Person) { setSelected(person); setInterested(false); }

  return (
    <section id="people" className="people-section page-section relative bg-background" data-paused={paused || undefined}>
      <div className="section-container grid items-center gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
        <div className="max-w-[480px]">
          <Badge variant="secondary" className="mb-6 h-auto rounded-full px-3 py-1.5 font-normal"><span className="mr-1 size-1.5 rounded-full bg-primary" />相遇，从看见彼此开始</Badge>
          <KineticHeading first="有人写代码，" second="有人和你想到一起。" />
          <RoleWheel />
          <p className="mt-4 text-base leading-[1.9] text-muted-foreground md:text-lg">看看他们做过什么、正在寻找什么。下一次合作，也许就从一句「这个想法，我也喜欢」开始。</p>
          <div className="mt-8 flex items-center gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary/70 text-primary"><MapPin className="size-5" aria-hidden /></span>
            <div><p className="text-sm font-medium">同一场活动，更近一步</p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">发现与推荐，只发生在你加入的活动中</p></div>
          </div>
          <Button asChild variant="secondary" size="xl" className="mt-8 border-0 shadow-none"><a href="#profile">先让大家认识我<ArrowRight /></a></Button>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">周末造物场 · 演示人物 · 悬停可慢慢看</p>
        </div>
        <div className="relative min-w-0">
          <div aria-hidden className="pointer-events-none absolute inset-x-5 inset-y-20 rounded-full bg-secondary/65 blur-[65px]" />
          <div className="people-window relative flex gap-4 overflow-hidden px-2 sm:gap-5 sm:px-3" aria-label="开发者资料滚动展示">
            <PeopleColumn entries={people.slice(0, 3)} onSelect={select} />
            <PeopleColumn entries={people.slice(3)} reverse onSelect={select} />
          </div>
        </div>
      </div>
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-[24px] sm:max-w-[480px]">
          <DialogHeader><DialogTitle>认识 {selected?.name}</DialogTitle><DialogDescription>周末造物场的人物资料示例</DialogDescription></DialogHeader>
          {selected && <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl bg-muted p-4"><Image src={"/avatars/avatar-" + selected.image + ".jpg"} alt="" width={64} height={64} className="size-16 rounded-2xl object-cover ring-4 ring-background" /><div><h3 className="text-xl font-semibold">{selected.name}</h3><p className="mt-1 text-sm text-muted-foreground">{selected.role} · {selected.tag}</p></div></div>
            <p className="text-sm leading-7 text-body">{selected.about}</p>
            <div className="rounded-2xl bg-muted p-4"><p className="text-xs text-muted-foreground">正在琢磨的想法</p><p className="mt-2 font-medium">{selected.project}</p></div>
            <p className="flex items-center gap-2 text-sm text-body"><Clock3 className="size-4 text-primary" />{selected.availability}</p>
            <Button className="h-11 w-full rounded-xl" onClick={() => setInterested(!interested)}>{interested ? <><Check />已标记感兴趣（演示）</> : <>对这位队友感兴趣<ArrowRight /></>}</Button>
            <p role="status" className="text-center text-xs leading-5 text-muted-foreground">{interested ? "已在当前预览中标记，未发送好友申请。" : "体验互动即可，无需注册或提供个人资料。"}</p>
          </div>}
        </DialogContent>
      </Dialog>
      <style>{".people-person-card { box-shadow: 0 4px 8px -6px color-mix(in srgb,var(--night) 14%,transparent), 0 12px 32px -22px color-mix(in srgb,var(--primary) 32%,transparent); } .people-person-card:hover { box-shadow: 0 8px 16px -12px color-mix(in srgb,var(--night) 18%,transparent), 0 18px 36px -20px color-mix(in srgb,var(--primary) 35%,transparent); } .people-section[data-paused] .ui-gt__fill { animation-play-state: paused; } .people-section[data-paused] .ui-gt__fill, .people-section[data-paused] .ui-gt__base { transition: none; } @media(max-width:767px) { .people-section .people-column { min-width: 220px; } }"}</style>
    </section>
  );
}
