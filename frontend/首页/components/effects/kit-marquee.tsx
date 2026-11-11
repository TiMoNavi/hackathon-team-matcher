"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useMotionPreference } from "@/components/motion-preference";

/** Shadcn UI Kit hero14 / MarqueeEffect, adapted to a measured horizontal loop.
 * Native ResizeObserver replaces react-use-measure; the measured transform runs
 * on the browser compositor. Native playback controls retain the exact position
 * across React motion-preference changes, hover, and offscreen/hidden-tab pauses.
 */
export function KitMarquee({ children, speed = 26, reverse = false, phase = 0, className = "" }: {
  children: ReactNode; speed?: number; reverse?: boolean; phase?: number; className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const playback = useRef<Animation | null>(null);
  const running = useRef(true);
  const onScreen = useRef(true);
  const rate = useRef(1);
  const { paused } = useMotionPreference();

  useEffect(() => {
    const node = root.current;
    const content = group.current;
    const strip = track.current;
    if (!node || !content || !strip) return;
    const sync = () => {
      if (running.current && onScreen.current && !document.hidden) playback.current?.play();
      else playback.current?.pause();
    };
    let lastWidth = 0;
    const measure = () => {
      // Measure layout width, not the rotated/scaled ancestor's bounding box.
      const distance = content.offsetWidth;
      if (!distance || Math.abs(distance - lastWidth) < 1) return;
      lastWidth = distance;
      playback.current?.cancel();
      const duration = distance / speed * 1000;
      playback.current = strip.animate([
        { transform: "translateX(" + (reverse ? -distance : 0) + "px)" },
        { transform: "translateX(" + (reverse ? 0 : -distance) + "px)" },
      ], { easing: "linear", duration, iterations: Infinity });
      playback.current.currentTime = duration * phase;
      playback.current.playbackRate = rate.current;
      sync();
    };
    const resize = new ResizeObserver(measure);
    resize.observe(content);
    const observer = new IntersectionObserver(([entry]) => { onScreen.current = entry.isIntersecting; sync(); });
    observer.observe(node);
    document.addEventListener("visibilitychange", sync);
    measure();
    return () => { resize.disconnect(); observer.disconnect(); playback.current?.cancel(); document.removeEventListener("visibilitychange", sync); };
  }, [speed, reverse, phase]);

  useLayoutEffect(() => {
    running.current = !paused;
    const animation = playback.current;
    if (!animation) return;
    if (paused || !onScreen.current || document.hidden) animation.pause();
    else animation.play();
  }, [paused]);

  const changeSpeed = (slow: boolean) => {
    rate.current = slow ? .16 : 1;
    if (playback.current) playback.current.playbackRate = rate.current;
  };

  return (
    <div ref={root} className={className} onMouseEnter={() => changeSpeed(true)} onMouseLeave={() => changeSpeed(false)}>
      <div ref={track} className="hero-lane-track">
        <div ref={group} className="hero-lane-group">{children}</div>
        <div className="hero-lane-group" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}
