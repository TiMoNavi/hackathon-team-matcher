"use client";
import { FrostCloud } from "@/components/illustrations/frost-cloud";
import { useMotionPreference } from "@/components/motion-preference";
import { cn } from "@/lib/utils";
// AffectUI Frost Cloud, recolored through its public CSS variables.
export function AiCompanion({ className }: { className?: string }) {
  const { paused } = useMotionPreference();
  return <div className={cn("ai-companion", className)}><FrostCloud background={false} paused={paused} followPointer={!paused} label="你的 AI 组队助手，一朵会眨眼的小云" /></div>;
}
