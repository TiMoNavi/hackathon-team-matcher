"use client";

import { motion } from "motion/react";
import { Sparkles, Star } from "lucide-react";
import { PersonAvatar, SourceBadge } from "@/components/mockups";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const themes = [
  { label: "Data export", value: 82 },
  { label: "Mobile dark mode", value: 64 },
  { label: "Enterprise SSO", value: 51 },
];

/** Brand panel beside the sign-in form: a live-looking AI digest and a quote. */
export function LoginShowcase() {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#E4DEFF_0%,#F4F1FF_55%,#ECFBC4_100%)] p-10 xl:p-14">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(rgba(91,61,245,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(91,61,245,0.08) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/25 blur-[100px]"
      />

      <div className="relative flex flex-col gap-3">
        <span className="text-[13px] font-semibold tracking-[0.12em] text-primary uppercase">
          While you were away
        </span>
        <h2 className="max-w-[440px] font-heading text-[34px] leading-[1.08] font-semibold tracking-[-0.04em] text-foreground xl:text-[40px]">
          128 new signals are waiting in your inbox.
        </h2>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative my-10"
      >
        <Card className="max-w-[460px] gap-4 rounded-2xl border border-white text-base shadow-[0_30px_80px_-30px_rgba(37,22,120,0.45)] ring-0 [--card-spacing:--spacing(6)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[14px] font-semibold text-primary">
              <Sparkles className="size-4" /> AI summary · this week
            </CardTitle>
          </CardHeader>
          <CardContent className="gap-4">
            <p className="text-[14px] leading-[22px] text-body">
              <span className="rounded bg-lime px-1 font-medium text-foreground">Data export</span>{" "}
              is the fastest-growing request, up 38% from last week.
            </p>
            <div className="flex flex-col gap-2.5">
              {themes.map((t, i) => (
                <div key={t.label}>
                  <div className="mb-1 flex justify-between text-[12px] text-body">
                    <span>{t.label}</span>
                    <span className="font-semibold text-foreground">{t.value}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${t.value}%` }}
                      transition={{ delay: 0.6 + i * 0.15, duration: 0.9, ease: "easeOut" }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <SourceBadge source="chat" />
              <SourceBadge source="support" />
              <SourceBadge source="email" />
              <SourceBadge source="survey" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <figure className="relative flex max-w-[460px] flex-col gap-4">
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="size-4 fill-[#FBBF24] text-[#FBBF24]" />
          ))}
        </div>
        <blockquote className="text-[17px] leading-[27px] text-foreground">
          “Our Monday roadmap review used to take two hours. Now we open Signalry, read the
          digest, and we’re done in twenty minutes.”
        </blockquote>
        <figcaption className="flex items-center gap-3">
          <PersonAvatar name="Marcus Lee" i={0} size={36} />
          <span className="flex flex-col">
            <span className="text-[14px] font-semibold text-foreground">Marcus Lee</span>
            <span className="text-[13px] text-muted-foreground">Head of Product, Kitebase</span>
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
