"use client";

import { motion, type Variants } from "motion/react";
import { Inbox, Rocket, Sparkles, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MotionCard } from "@/components/motion-primitives";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";


const steps: {
  step: string;
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    step: "Step 01 · Listen",
    number: "01",
    title: "Connect your channels",
    description:
      "Plug in chat, email, helpdesk and surveys in a few clicks. Signals start flowing in right away.",
    icon: Inbox,
  },
  {
    step: "Step 02 · Understand",
    number: "02",
    title: "Let AI find the patterns",
    description:
      "Similar requests are grouped into themes and scored by revenue, reach and urgency.",
    icon: Sparkles,
  },
  {
    step: "Step 03 · Deliver",
    number: "03",
    title: "Ship and close the loop",
    description:
      "Move themes onto your roadmap and notify every customer who asked once it ships.",
    icon: Rocket,
  },
];

const letterVariants: Variants = {
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", damping: 12, stiffness: 100 },
  },
  hidden: {
    opacity: 0,
    x: -5,
    transition: { type: "spring", damping: 12, stiffness: 100 },
  },
};

/** Types the label in letter by letter when it scrolls into view. */
function AnimatedText({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <motion.span
      style={{ display: "flex", overflow: "hidden" }}
      variants={{
        hidden: { opacity: 0 },
        visible: (i: number = 1) => ({
          opacity: 1,
          transition: { staggerChildren: 0.04, delayChildren: i * delay },
        }),
      }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
    >
      {Array.from(text).map((char, i) => (
        <motion.span key={i} variants={letterVariants}>
          {char === " " ? " " : char}
        </motion.span>
      ))}
    </motion.span>
  );
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

export default function WorkflowSteps() {
  return (
    <section className="w-full overflow-hidden bg-muted px-[20px] py-[64px] md:px-[40px] md:py-[80px] lg:px-[96px] lg:py-[120px]">
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 30 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
        }}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="mx-auto flex max-w-[1248px] flex-col items-center gap-[60px] md:gap-[80px]"
      >
        <div className="flex w-full max-w-[760px] flex-col items-center gap-[16px] text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Badge variant="surface" className="h-auto px-3 py-1 text-[13px]">
              How it works
            </Badge>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-heading text-[34px] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground md:text-[52px]"
          >
            From scattered noise to <br className="hidden md:block" /> shipped features
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-[16px] leading-[26px] text-muted-foreground md:text-[18px] md:leading-[28px]"
          >
            Three steps, no spreadsheets. Most teams are up and running before their
            next standup.
          </motion.p>
        </div>

        <motion.div
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.2 } },
          }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="relative flex w-full flex-col items-stretch gap-[20px] lg:flex-row"
        >
          {/* connector line */}
          <div
            aria-hidden
            className="absolute left-[16%] right-[16%] top-[52px] hidden border-t-2 border-dashed border-primary/20 lg:block"
          />
          {steps.map((s, i) => (
            <MotionCard
              key={s.step}
              variants={cardVariants}
              whileHover={{ y: -4, boxShadow: "0px 16px 32px -12px rgba(37,22,120,0.18)" }}
              className="relative flex-1 items-start gap-10 rounded-[24px] border border-white shadow-none ring-0 transition-all duration-300 [--card-spacing:--spacing(7)] md:gap-[72px]"
            >
              <CardHeader className="flex w-full items-center justify-between">
                <motion.span
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3, delay: i * 0.4, repeat: Infinity, ease: "easeInOut" }}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-[0_10px_24px_-8px_rgba(91,61,245,0.6)]"
                >
                  <s.icon className="h-5 w-5" />
                </motion.span>
                <span
                  aria-hidden
                  className="font-heading text-[88px] font-bold leading-none tracking-[-0.06em] text-transparent"
                  style={{ WebkitTextStroke: "1.5px rgba(91,61,245,0.22)" }}
                >
                  {s.number}
                </span>
              </CardHeader>
              <CardContent className="relative z-10 gap-2">
                <div className="text-[13px] font-semibold text-primary">
                  <AnimatedText text={s.step} delay={0.3 * i} />
                </div>
                <CardTitle className="text-[24px] font-semibold tracking-[-0.03em]">
                  {s.title}
                </CardTitle>
                <CardDescription className="text-[16px] leading-[24px]">
                  {s.description}
                </CardDescription>
              </CardContent>
            </MotionCard>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
