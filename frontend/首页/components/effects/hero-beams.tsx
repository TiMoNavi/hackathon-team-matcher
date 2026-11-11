"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useInView } from "motion/react";
import { BackgroundBeamsWithCollision } from "@/components/effects/kit-beams";
import { useMotionPreference } from "@/components/motion-preference";

function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}
const isVisible = () => !document.hidden;
const serverVisible = () => true;

// Cosmic's original collision beams; size-aware placement keeps the headline clear.
export function HeroBeams() {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { paused } = useMotionPreference();
  const inView = useInView(root, { amount: .1 });
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, serverVisible);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const beams = useMemo(() => (size.width < 600 ? [.06, .23, .77, .94] : [.05, .16, .29, .71, .84, .95]).map((position, i) => ({
    initialX: size.width * position, translateX: size.width * position,
    initialY: -120, translateY: size.height + 160,
    duration: 6 + (i % 3) * 1.3, delay: i * .6, repeatDelay: 1 + i % 3,
    className: "hero-light-beam h-20 w-[1.5px]",
  })), [size]);
  const active = !paused && inView && visible && size.width > 0;
  return <div ref={root} className="hero-beams" data-active={active} aria-hidden="true">
    {active && <BackgroundBeamsWithCollision beams={beams} className="h-full">{null}</BackgroundBeamsWithCollision>}
  </div>;
}
