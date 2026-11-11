"use client";

import { motion } from "motion/react";
import { Sparkles, Layers, Gauge, FileText, type LucideIcon } from "lucide-react";
import { AskAiMockup } from "@/components/mockups";
import { Badge } from "@/components/ui/badge";
import { MotionCard } from "@/components/motion-primitives";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";


const highlights: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Layers,
    title: "Automatic theming",
    description: "Thousands of comments condensed into a handful of clear themes.",
  },
  {
    icon: Gauge,
    title: "Impact estimates",
    description: "Know which fix moves revenue and retention before you build it.",
  },
  {
    icon: FileText,
    title: "Weekly digests",
    description: "A plain-language summary of what changed, delivered every Monday.",
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
};

export default function AiIntelligence() {
  return (
    <section id="ai" className="flex w-full justify-center bg-white p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative flex w-full flex-col items-center overflow-hidden rounded-[28px] bg-night p-6 md:rounded-[36px] md:p-20 lg:px-16"
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/40 blur-[120px]"
          animate={{ scale: [1, 1.25, 1], opacity: [0.35, 0.6, 0.35] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative flex w-full max-w-[1248px] flex-col items-center gap-10 md:gap-16">
          <div className="flex max-w-[680px] flex-col items-center gap-4">
            <motion.div {...fadeUp} transition={{ duration: 0.6, delay: 0.1 }}>
              <Badge
                variant="outline-inverse"
                className="h-auto gap-2 px-3 py-1 text-[12px] font-semibold tracking-[0.12em] uppercase md:text-[13px] [&>svg]:size-4!"
              >
                <Sparkles />
                Signalry AI
              </Badge>
            </motion.div>
            <motion.h2
              {...fadeUp}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="text-center font-heading text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-[36px] md:text-[52px]"
            >
              Ask your feedback a question. Get an answer.
            </motion.h2>
            <motion.p
              {...fadeUp}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-center text-[15px] leading-[24px] text-white/60 md:text-[18px] md:leading-[28px]"
            >
              No more tagging marathons. Type a question in plain English and Signalry
              reads every conversation to give you the answer, with sources.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="w-full"
          >
            <AskAiMockup />
          </motion.div>

          <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-3">
            {highlights.map((h, i) => (
              <MotionCard
                key={h.title}
                {...fadeUp}
                transition={{ duration: 0.6, delay: 0.3 + 0.1 * i }}
                className="gap-3 rounded-2xl border border-white/10 bg-white/[0.04] text-white shadow-none ring-0"
              >
                <CardHeader className="gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lime">
                    <h.icon className="h-5 w-5" />
                  </span>
                  <CardTitle className="text-[19px] font-semibold md:text-[20px]">
                    {h.title}
                  </CardTitle>
                  <CardDescription className="text-[14px] leading-[22px] text-white/60 md:text-[15px] md:leading-[24px]">
                    {h.description}
                  </CardDescription>
                </CardHeader>
              </MotionCard>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
