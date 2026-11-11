import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PhoneMockup({
  children,
  className,
  rotate = 0,
}: {
  children: ReactNode;
  className?: string;
  rotate?: number;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto aspect-[9/19] w-[260px] rounded-[2.5rem] border border-border bg-card p-2 shadow-[var(--shadow-glass)]",
        className,
      )}
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    >
      <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-foreground/90" />
      <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-background">
        {children}
      </div>
    </div>
  );
}