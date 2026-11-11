"use client";

import Image from "next/image";
import { motion, type Transition } from "motion/react";
import { ArrowRight, Headset, Mail, MessagesSquare, Play, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { TourDialog } from "@/components/tour-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HeroDashboard } from "@/components/mockups";

const floatingChips = [
  {
    icon: MessagesSquare,
    text: "“Export to CSV?”",
    className: "top-[150px] left-[40px] -rotate-6",
    duration: 5,
  },
  {
    icon: Mail,
    text: "12 new emails",
    className: "top-[120px] right-[48px] rotate-6",
    duration: 6,
  },
  {
    icon: Headset,
    text: "SSO request ×27",
    className: "top-[330px] left-[16px] rotate-3",
    duration: 5.5,
  },
  {
    icon: Sparkles,
    text: "New theme found",
    className: "top-[310px] right-[20px] -rotate-3",
    duration: 6.5,
  },
];

const customers = ["Northwind", "Lumora", "Kitebase", "Orbitly", "Fernway", "Quanta"];

const fadeUp = { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 } };
const spring: Transition = { duration: 0.6, ease: [0.22, 0.68, 0, 1.2] };

function Wordmark({ name, i }: { name: string; i: number }) {
  const shapes = [
    <circle key="c" cx="10" cy="10" r="8" />,
    <rect key="r" x="2" y="2" width="16" height="16" rx="4" />,
    <path key="t" d="M10 2 18 18H2z" />,
    <path key="d" d="M10 1 19 10 10 19 1 10z" />,
  ];
  return (
    <span className="flex items-center gap-2 text-[22px] font-heading font-bold tracking-[-0.04em] text-foreground md:text-[26px]">
      <svg viewBox="0 0 20 20" className="h-6 w-6 fill-foreground">
        {shapes[i % shapes.length]}
      </svg>
      {name}
    </span>
  );
}

export default function Hero() {
  return (
    <section className="relative flex w-full md:min-h-screen flex-col items-center overflow-hidden bg-[linear-gradient(180deg,#E4DEFF_0%,#F4F1FF_45%,#FFFFFF_100%)]">
      {/* grid pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(rgba(91,61,245,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(91,61,245,0.08) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 70% 55% at 50% 20%, black 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 55% at 50% 20%, black 30%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[880px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
      />

      <SiteHeader />

      <div className="relative mx-auto w-full max-w-[1248px]">
        <div className="pointer-events-none absolute inset-0 hidden lg:block">
          {floatingChips.map((chip, i) => (
            <motion.div
              key={chip.text}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.1 + 0.05 * i }}
              className={"absolute z-10 " + chip.className}
            >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: chip.duration, repeat: Infinity, ease: "easeInOut" }}
                className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white bg-white/90 px-3.5 py-2.5 text-[13px] font-medium text-foreground shadow-[0_12px_30px_-10px_rgba(37,22,120,0.3)] backdrop-blur"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-primary">
                  <chip.icon className="h-4 w-4" />
                </span>
                {chip.text}
              </motion.div>
            </motion.div>
          ))}
        </div>

        <div className="z-20 mt-14 flex flex-col items-center px-6 md:mt-20">
          <motion.div
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ ...spring, delay: 0.15 }}
            className="mb-5"
          >
            <Badge
              asChild
              variant="outline"
              className="h-auto gap-2 rounded-full border-primary/15 bg-white/80 py-1 pr-3 pl-1 text-[13px] font-normal text-body backdrop-blur md:text-[14px]"
            >
              <a href="#ai">
                <Badge className="h-auto bg-foreground px-2.5 py-0.5 text-[12px] font-semibold text-lime">
                  New
                </Badge>
                <span>
                  Ask Signalry <span className="hidden sm:inline">anything</span> about
                  your customers
                </span>
                <ArrowRight />
              </a>
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ ...spring, delay: 0.25 }}
            className="mb-5 max-w-[880px] text-center font-heading text-[38px] font-semibold leading-[1.05] tracking-[-0.04em] text-foreground sm:text-[48px] md:text-[60px] lg:text-[68px]"
          >
            Hear every customer.{" "}
            <span className="relative whitespace-nowrap text-primary">
              Build what matters
              <svg
                viewBox="0 0 300 12"
                className="absolute -bottom-2 left-0 h-3 w-full"
                preserveAspectRatio="none"
                aria-hidden
              >
                <motion.path
                  d="M2 9C60 3 140 2 298 7"
                  fill="none"
                  stroke="#D9F85F"
                  strokeWidth="6"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.9, duration: 0.8, ease: "easeOut" }}
                />
              </svg>
            </span>
            .
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ ...spring, delay: 0.35 }}
            className="mb-8 max-w-[640px] text-center text-base leading-[1.6] text-body md:mb-10 md:text-lg"
          >
            Signalry pulls feedback from chat, email, support and surveys into one inbox,
            lets AI surface the themes behind it, and turns the loudest needs into a
            roadmap your whole team trusts.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ ...spring, delay: 0.45 }}
            className="mb-4 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row"
          >
            <Button
              size="xl"
              className="group w-full shadow-[0_10px_30px_-10px_rgba(91,61,245,0.7)] hover:-translate-y-px hover:bg-primary/90 sm:w-auto"
            >
              Start free, no card needed
              <ArrowRight className="transition-transform group-hover:translate-x-1" />
            </Button>
            <TourDialog>
              <Button
                variant="outline"
                size="xl"
                className="w-full font-medium hover:-translate-y-px hover:bg-background hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] sm:w-auto"
              >
                <Play className="fill-foreground" />
                Watch the tour
              </Button>
            </TourDialog>
          </motion.div>

          <motion.p
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ ...spring, delay: 0.52 }}
            className="mb-10 text-center text-sm text-muted-foreground md:mb-14"
          >
            Free for teams up to 3 · Set up in under five minutes
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.62 }}
            className="relative w-full max-w-[1120px]"
          >
            {/* Snapshot of <HeroDashboard /> with 32px of hero background baked in
                on the sides and top: centered so the sides overflow evenly, and
                pulled up by the top padding (2.71% of its width). */}
            <div className="hidden justify-center md:flex">
              <Image
                src="/images/hero-dashboard.jpg"
                alt="Signalry inbox with new customer signals and a weekly AI summary"
                width={2368}
                height={902}
                preload
                sizes="(min-width: 1184px) 1184px, 106vw"
                className="-mt-[2.865%] h-auto w-[105.714%] max-w-none shrink-0"
                style={{
                  // Fade the baked-in padding so the snapshot blends into the hero.
                  maskImage:
                    "linear-gradient(to right, transparent, black 2.7%, black 97.3%, transparent), linear-gradient(to bottom, transparent, black 7%, black 80%, transparent)",
                  WebkitMaskImage:
                    "linear-gradient(to right, transparent, black 2.7%, black 97.3%, transparent), linear-gradient(to bottom, transparent, black 7%, black 80%, transparent)",
                  maskComposite: "intersect",
                  WebkitMaskComposite: "source-in",
                }}
              />
            </div>
            {/* Shrinking the snapshot makes it unreadable on phones, so they get the
                live component, which collapses to the inbox column. */}
            <div
              className="md:hidden"
              style={{
                maskImage: "linear-gradient(to bottom, black 75%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 75%, transparent 100%)",
              }}
            >
              <HeroDashboard />
            </div>
          </motion.div>

          <motion.p
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ ...spring, delay: 0.75 }}
            className="mb-8 mt-10 text-center text-[15px] font-medium text-muted-foreground md:mt-14"
          >
            4,000+ product teams listen to their customers with Signalry
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="initial"
            animate="animate"
            transition={{ ...spring, delay: 0.85 }}
            className="relative mb-12 w-full overflow-hidden md:mb-20"
            style={{
              maskImage:
                "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
            }}
          >
            <div className="flex w-max animate-marquee items-center gap-12 opacity-50 md:gap-20">
              {[...customers, ...customers, ...customers, ...customers].map((name, i) => (
                <Wordmark key={i} name={name} i={i} />
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
