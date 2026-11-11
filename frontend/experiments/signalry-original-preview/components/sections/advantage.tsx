"use client";

import { useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Target, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MotionButton } from "@/components/motion-primitives";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { roundTriggerClass } from "@/components/accordion-styles";
import {
  AlignPanel,
  LoopPanel,
  RankingPanel,
  SentimentPanel,
  SourcesPanel,
  VotingPanel,
} from "@/components/mockups";

type DropdownItem = {
  id: string;
  title: string;
  description: string;
  Panel: ComponentType;
};

type FeatureRowProps = {
  icon: LucideIcon;
  label: string;
  heading: string;
  description: string;
  dropdownItems: DropdownItem[];
  isReversed?: boolean;
};

function FeatureRow({
  icon: Icon,
  label,
  heading,
  description,
  dropdownItems,
  isReversed = false,
}: FeatureRowProps) {
  const [openId, setOpenId] = useState<string | null>(dropdownItems[0]?.id ?? null);
  const active = dropdownItems.find((d) => d.id === openId) ?? dropdownItems[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: [0.21, 0.45, 0.32, 0.9] }}
      className={
        "flex flex-col items-start gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-20 " +
        (isReversed ? "lg:flex-row-reverse" : "")
      }
    >
      <div className="flex w-full flex-col gap-6 lg:w-[540px]">
        <motion.span
          animate={{ rotate: [0, -6, 0, 6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lime text-foreground md:h-16 md:w-16"
        >
          <Icon className="h-7 w-7" />
        </motion.span>

        <div className="flex flex-col gap-3 md:gap-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary md:text-[12px]">
            {label}
          </span>
          <h3 className="font-heading text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground md:text-[36px]">
            {heading}
          </h3>
          <p className="text-[15px] leading-[24px] text-muted-foreground md:text-[17px] md:leading-[27px]">
            {description}
          </p>
        </div>

        <Accordion
          type="single"
          collapsible
          value={openId ?? ""}
          onValueChange={(v) => setOpenId(v || null)}
          className="mt-2 gap-2"
        >
          {dropdownItems.map((d) => (
            <AccordionItem
              key={d.id}
              value={d.id}
              className="rounded-2xl border border-border bg-white transition-colors data-[state=open]:border-primary/30 data-[state=open]:bg-muted"
            >
              <AccordionTrigger className={cn(roundTriggerClass, "px-5 py-4 text-[16px] md:text-[17px]")}>
                {d.title}
              </AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4 px-5 pb-5 [&_p:not(:last-child)]:mb-0">
                <p className="text-[14px] leading-[22px] text-body md:text-[15px] md:leading-[24px]">
                  {d.description}
                </p>
                <MotionButton
                  asChild
                  variant="link"
                  whileHover="hover"
                  className="h-auto w-fit gap-2 p-0 text-[14px] font-semibold no-underline! hover:no-underline"
                >
                  <a href="#">
                    See how it works
                    <motion.span variants={{ hover: { x: 4 } }} transition={{ duration: 0.3 }}>
                      <ArrowRight />
                    </motion.span>
                  </a>
                </MotionButton>
                <div className="overflow-hidden rounded-xl border border-border lg:hidden">
                  <d.Panel />
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <motion.div
        whileHover={{ scale: 1.015 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative hidden overflow-hidden rounded-[28px] border border-border lg:block lg:h-[440px] lg:w-[540px]"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            <active.Panel />
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export default function Advantage() {
  return (
    <section className="flex w-full justify-center overflow-hidden bg-white px-6 py-20 lg:px-[96px] lg:py-[120px]">
      <div className="flex w-full max-w-[1248px] flex-col gap-20 lg:gap-[120px]">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mx-auto flex max-w-[720px] flex-col gap-3 text-center md:gap-4"
        >
          <h2 className="font-heading text-[34px] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground md:text-[52px]">
            Decisions backed by real voices, not hunches
          </h2>
          <p className="text-[16px] leading-[26px] text-muted-foreground md:text-[18px] md:leading-[28px]">
            When everyone sees the same evidence, debates get shorter and launches land
            better. Here’s how Signalry gets your whole company on the same page.
          </p>
        </motion.div>

        <FeatureRow
          icon={Users}
          label="For the whole team"
          heading="Give every team the same source of truth"
          description="Product, engineering, sales and support all look at one living picture of what customers need. No more forwarding screenshots."
          dropdownItems={[
            {
              id: "a-1",
              title: "Every channel, counted once",
              description:
                "Signalry merges duplicates across tools, so a request mentioned in chat, email and a call is one item with three voices behind it.",
              Panel: SourcesPanel,
            },
            {
              id: "a-2",
              title: "Mood, measured automatically",
              description:
                "Sentiment is scored on every message, so you can spot frustration early and celebrate what customers love.",
              Panel: SentimentPanel,
            },
            {
              id: "a-3",
              title: "Updates that write themselves",
              description:
                "When something ships, Signalry drafts the release note and sends it to exactly the people who asked for it.",
              Panel: LoopPanel,
            },
          ]}
        />

        <FeatureRow
          isReversed
          icon={Target}
          label="For product leads"
          heading="Prioritize with confidence, not consensus"
          description="Rank ideas by the revenue, reach and urgency behind them, and defend your roadmap with data anyone can check."
          dropdownItems={[
            {
              id: "b-1",
              title: "Impact scoring out of the box",
              description:
                "Each request gets a score based on how many customers want it, how much they pay and how often they mention it.",
              Panel: RankingPanel,
            },
            {
              id: "b-2",
              title: "Public boards customers love",
              description:
                "Let customers vote and comment on ideas in a branded portal. Every vote flows straight into your scores.",
              Panel: VotingPanel,
            },
            {
              id: "b-3",
              title: "Weekly syncs in ten minutes",
              description:
                "Auto-generated briefs show what changed, what’s trending and who needs a follow-up, so meetings stay focused.",
              Panel: AlignPanel,
            },
          ]}
        />
      </div>
    </section>
  );
}
