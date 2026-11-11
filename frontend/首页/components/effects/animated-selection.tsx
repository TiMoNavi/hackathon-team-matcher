"use client";

import { Children, cloneElement, useId, type ReactElement, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMotionPreference } from "@/components/motion-preference";
import { cn } from "@/lib/utils";

type Item = ReactElement<{ "data-id": string; children: ReactNode; className?: string }>;

// Shadcn UI Kit AnimatedBackground: shared layout selection layer.
// Controlled selection preserves each button's business, focus and ARIA handlers.
export function AnimatedSelection({ value, children }: { value: string; children: Item[] }) {
  const id = useId();
  const { paused } = useMotionPreference();
  return Children.map(children, child => cloneElement(child, {
    className: cn(child.props.className, "relative isolate"),
  }, <>
    <AnimatePresence initial={false}>
      {child.props["data-id"] === value && <motion.span aria-hidden="true" layoutId={id} className="source-selection-light absolute inset-0 rounded-2xl bg-primary shadow-lg shadow-primary/20" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={paused ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }} />}
    </AnimatePresence>
    <span className="relative z-10 flex flex-col items-center gap-2 sm:flex-row sm:gap-3">{child.props.children}</span>
  </>));
}
