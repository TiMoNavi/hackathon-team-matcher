"use client";

import { motion } from "motion/react";
import { Hexagon, Box, FileText, Command, Cloud, Activity } from "lucide-react";

// Design space: 600×600, half = 300. xPct/yPct are % of half-container (50%).
const STATIC_ICONS = [
  { Icon: Hexagon, r: 80, a: 210 },
  { Icon: Box, r: 170, a: 330 },
  { Icon: FileText, r: 170, a: 120 },
  { Icon: Cloud, r: 260, a: 45 },
  { Icon: Activity, r: 260, a: 260 },
].map(({ Icon, r, a }) => ({
  Icon,
  xPct: Math.cos(a * (Math.PI / 180)) * (r / 300) * 50,
  yPct: Math.sin(a * (Math.PI / 180)) * (r / 300) * 50,
}));

export default function Illustration22() {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-square w-full max-w-md overflow-hidden"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[24px_24px] opacity-40" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="absolute h-[26.7%] w-[26.7%] rounded-full border" />
        <div className="absolute h-[56.7%] w-[56.7%] rounded-full border" />
        <div className="absolute h-[86.7%] w-[86.7%] rounded-full border" />

        {STATIC_ICONS.map(({ Icon, xPct, yPct }, idx) => (
          <div
            key={idx}
            className="bg-background text-muted-foreground absolute z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur-md"
            style={{
              left: `calc(50% + ${xPct}%)`,
              top: `calc(50% + ${yPct}%)`,
            }}
          >
            <Icon size={18} strokeWidth={1.5} />
          </div>
        ))}

        <div className="pointer-events-none absolute z-20 h-[86.7%] w-[86.7%] overflow-hidden rounded-full">
          <motion.div
            className="absolute"
            style={{
              width: "160%",
              height: "160%",
              top: "-30%",
              left: "-30%",
              background:
                "conic-gradient(from 0deg at 50% 50%, transparent 0%, transparent 40%, rgba(34,197,94,0.02) 55%, rgba(34,197,94,0.08) 75%, rgba(34,197,94,0.22) 100%)",
            }}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
          />
        </div>

        <div className="bg-background text-foreground absolute z-30 flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-xl">
          <Command size={24} strokeWidth={2} />
        </div>
      </div>

      <div className="from-background pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t to-transparent" />
    </div>
  );
}
