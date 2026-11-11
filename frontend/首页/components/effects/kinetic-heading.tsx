"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { TextReveal } from "@/components/effects/text-reveal";
import { useMotionPreference } from "@/components/motion-preference";

/** AffectUI TextReveal + GradientText's moving pigment, composed as two timed lines.
 * The whole heading is the intersection target, so Chinese inline spans cannot
 * miss their entrance. Replay is explicit; reading never requires animation.
 */
export function KineticHeading({ first, second, id, className = "" }: {
  first: string; second: string; id?: string; className?: string;
}) {
  const [iteration, setIteration] = useState(0);
  const { paused } = useMotionPreference();
  return <div className={"kinetic-heading-group " + className}>
    <h2 id={id} className="section-heading kinetic-heading" key={iteration}>
      <TextReveal text={first} by="char" as="span" className="kinetic-line" stagger={58} duration={1000} />
      <TextReveal text={second} by="char" as="span" className="kinetic-line kinetic-ink" delay={280} stagger={68} duration={1150} />
    </h2>
    <button type="button" className="kinetic-replay" aria-label={"重播标题动效：" + first + second} title={paused ? "页面动画已暂停" : "重播标题动效"} disabled={paused} onClick={() => setIteration(value => value + 1)}><RotateCcw size={13} /><span>重播</span></button>
  </div>;
}
