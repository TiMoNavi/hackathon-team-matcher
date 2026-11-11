"use client";

import { motion, type Variants } from "motion/react";
import { cn } from "@/lib/utils";
import { DemandChart, RoadmapBoard, UnifiedInbox } from "@/components/mockups";
import { Badge } from "@/components/ui/badge";
import { MotionCard } from "@/components/motion-primitives";
import {
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const cardHover = { y: -4, boxShadow: "0 18px 40px -18px rgba(37,22,120,0.25)" };


const cardClass =
  "items-start gap-7 rounded-[24px] border border-border shadow-none ring-0 transition-all duration-300 [--card-spacing:--spacing(7)] md:[--card-spacing:--spacing(8)]";

function FeatureHeader({
  eyebrow,
  title,
  description,
  inverse = false,
  action,
}: {
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  inverse?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <CardHeader className="w-full gap-2.5">
      <span
        className={cn(
          "text-[12px] font-semibold tracking-[0.12em] uppercase",
          inverse ? "text-lime" : "text-primary",
        )}
      >
        {eyebrow}
      </span>
      <CardTitle
        className={cn(
          "text-[24px] leading-[30px] font-semibold tracking-[-0.03em]",
          inverse && "text-white",
        )}
      >
        {title}
      </CardTitle>
      <CardDescription
        className={cn(
          "max-w-[560px] text-[16px] leading-[24px]",
          inverse && "max-w-[620px] text-white/60",
        )}
      >
        {description}
      </CardDescription>
      {action && <CardAction>{action}</CardAction>}
    </CardHeader>
  );
}

export default function Features() {
  return (
    <section
      id="features"
      className="flex w-full justify-center bg-white px-[20px] py-[64px] md:px-[40px] md:py-[80px] lg:px-[96px] lg:py-[120px]"
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 20 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.8, ease: "easeOut", staggerChildren: 0.1 },
          },
        }}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="flex w-full max-w-[1248px] flex-col gap-[56px] md:gap-[72px]"
      >
        <div className="flex w-full flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <motion.h2
            variants={item}
            className="max-w-[640px] font-heading text-[34px] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground md:text-[52px]"
          >
            Everything your customers say, finally in one place
          </motion.h2>
          <motion.p
            variants={item}
            className="max-w-[460px] text-[16px] leading-[26px] text-muted-foreground md:text-[18px] md:leading-[28px]"
          >
            Stop digging through inboxes and spreadsheets. Signalry captures, groups and
            ranks feedback automatically, so you spend time deciding, not&nbsp;sorting.
          </motion.p>
        </div>

        <div className="flex w-full flex-col gap-[20px]">
          <div className="flex flex-col items-stretch gap-[20px] lg:flex-row">
            <MotionCard
              variants={item}
              whileHover={cardHover}
              className={cn(cardClass, "bg-muted lg:h-[500px] lg:w-[64%]")}
            >
              <FeatureHeader
                eyebrow="Capture"
                title="One inbox for every channel"
                description="Chat transcripts, support tickets, sales notes and survey answers land in a single stream, tagged and de-duplicated before you even look."
              />
              <CardContent className="h-[260px] w-full lg:h-auto lg:flex-1">
                <UnifiedInbox />
              </CardContent>
            </MotionCard>

            <MotionCard
              variants={item}
              whileHover={cardHover}
              className={cn(cardClass, "lg:h-[500px] lg:w-[36%]")}
            >
              <FeatureHeader
                eyebrow="Measure"
                title="See demand as it grows"
                description="Track which requests are heating up week over week, and who is asking."
              />
              <CardContent className="h-[230px] w-full lg:h-auto lg:flex-1">
                <DemandChart />
              </CardContent>
            </MotionCard>
          </div>

          <MotionCard
            variants={item}
            whileHover={cardHover}
            className={cn(cardClass, "w-full border-night bg-night")}
          >
            <FeatureHeader
              inverse
              eyebrow="Plan"
              title="A roadmap that explains itself"
              description={
                <>
                  Every card links back to the customers and conversations behind it, so
                  nobody has to ask “why are we building this?” again.
                </>
              }
              action={
                <Badge
                  variant="outline"
                  className="hidden h-auto border-white/15 px-3 py-1.5 text-[12px] text-white/70 md:inline-flex"
                >
                  Q3 roadmap · 6 items
                </Badge>
              }
            />
            <CardContent className="w-full">
              <RoadmapBoard />
            </CardContent>
          </MotionCard>
        </div>
      </motion.div>
    </section>
  );
}
