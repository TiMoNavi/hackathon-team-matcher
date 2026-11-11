"use client";

import { useEffect, useRef, type ComponentProps, type PointerEvent } from "react";
import { useInView } from "motion/react";
import { useMotionPreference } from "@/components/motion-preference";
import { cn } from "@/lib/utils";

/** Surface adaptation of AffectUI EmptyCalendar's tinted lower edge / diffused
 * glow and TiltCard's rAF pointer sampling. Keeps the content plane stationary.
 * Border and reflection are decorative; focus indicators remain independent.
 */
export function MaterialSurface({ children, className, onPointerMove, onPointerLeave, ...props }: ComponentProps<"div">) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const { paused } = useMotionPreference();
  const visible = useInView(root, { margin: "80px" });
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(event);
    if (paused || event.pointerType !== "mouse") return;
    const element = event.currentTarget;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const box = element.getBoundingClientRect();
      element.style.setProperty("--surface-x", ((clientX - box.left) / box.width * 100).toFixed(1) + "%");
      element.style.setProperty("--surface-y", ((clientY - box.top) / box.height * 100).toFixed(1) + "%");
    });
  };
  return <div {...props} ref={root} className={cn("material-surface", className)} data-surface-still={paused || !visible ? "true" : "false"} onPointerMove={move} onPointerLeave={event => { cancelAnimationFrame(frame.current); onPointerLeave?.(event); }}>
    <span className="material-reflection" aria-hidden="true" />
    <span className="material-trace" aria-hidden="true" />
    {children}
  </div>;
}
