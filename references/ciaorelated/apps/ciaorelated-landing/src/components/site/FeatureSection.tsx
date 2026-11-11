import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FeatureSection({
  id,
  eyebrow,
  title,
  description,
  media,
  reverse = false,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description: string;
  media: ReactNode;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <section id={id} className={cn("mx-auto max-w-6xl px-4 py-20 sm:px-6", className)}>
      <div
        className={cn(
          "grid items-center gap-10 md:grid-cols-2 md:gap-16",
          reverse && "md:[&>div:first-child]:order-2",
        )}
      >
        <div>
          {eyebrow && (
            <span className="inline-block rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </span>
          )}
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
          <p className="mt-4 max-w-lg text-base text-muted-foreground sm:text-lg">{description}</p>
        </div>
        <div className="relative">{media}</div>
      </div>
    </section>
  );
}