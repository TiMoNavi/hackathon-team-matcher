"use client";

import { Fragment, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { MotionButton, MotionCard } from "@/components/motion-primitives";
import { Badge } from "@/components/ui/badge";
import {
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type BillingCycle = "monthly" | "yearly";

const plans = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: "For small teams getting their first feedback loop off the ground.",
    cta: "Start for free",
    features: [
      "Up to 3 teammates",
      "2 connected channels",
      "500 signals per month",
      "Public feedback board",
      "Basic AI tagging",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    badge: "Most popular",
    monthlyPrice: 49,
    yearlyPrice: 39,
    description: "For product teams that want AI insights and a public roadmap.",
    cta: "Try Growth free for 14 days",
    features: [
      "Unlimited teammates",
      "Unlimited channels & signals",
      "Ask Signalry AI",
      "Impact scoring & revenue data",
      "Automated release notes",
      "Two-way Jira & Linear sync",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    monthlyPrice: 129,
    yearlyPrice: 99,
    description: "For larger orgs that need advanced security and dedicated support.",
    cta: "Talk to sales",
    features: [
      "Everything in Growth",
      "SSO & SCIM provisioning",
      "Audit logs & data residency",
      "Custom AI models per workspace",
      "Dedicated success manager",
    ],
  },
];

type Plan = (typeof plans)[number];

function PricingHeader({
  billingCycle,
  setBillingCycle,
}: {
  billingCycle: BillingCycle;
  setBillingCycle: (c: BillingCycle) => void;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-6 text-center">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-[720px] font-heading text-[34px] leading-[1.08] font-semibold tracking-[-0.04em] text-foreground md:text-[52px]"
      >
        Pricing that grows with your customer base
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="max-w-[560px] text-[16px] leading-[26px] text-muted-foreground md:text-[18px] md:leading-[28px]"
      >
        Start free, upgrade when you need more. Every paid plan includes a 14-day trial.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <ToggleGroup
          type="single"
          value={billingCycle}
          onValueChange={(v) => v && setBillingCycle(v as BillingCycle)}
          aria-label="Billing cycle"
          className="gap-0 rounded-full border border-border bg-muted p-1"
        >
          {(["monthly", "yearly"] as const).map((cycle) => (
            <ToggleGroupItem
              key={cycle}
              value={cycle}
              className="relative h-auto rounded-full px-4 py-2 text-[14px] text-muted-foreground transition-colors duration-300 hover:bg-transparent hover:text-foreground data-[state=on]:bg-transparent data-[state=on]:text-white md:text-[15px]"
            >
              {billingCycle === cycle && (
                <motion.span
                  layoutId="billing-pill"
                  className="absolute inset-0 rounded-full bg-foreground"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {cycle === "monthly" ? "Monthly" : "Yearly"}
                {cycle === "yearly" && (
                  <Badge variant="lime" className="h-auto px-1.5 py-0.5 text-[11px]">
                    −20%
                  </Badge>
                )}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </motion.div>
    </div>
  );
}

function PlanCard({
  plan,
  isActive,
  billingCycle,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  plan: Plan;
  isActive: boolean;
  billingCycle: BillingCycle;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const price = billingCycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
  return (
    <MotionCard
      layout
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      whileHover={{ y: -2 }}
      className={cn(
        "cursor-pointer gap-3 rounded-[20px] border shadow-none ring-0 transition-all duration-300 [--card-spacing:--spacing(6)] md:[--card-spacing:--spacing(7)]",
        isActive
          ? "border-primary bg-muted shadow-[0_12px_32px_-12px_rgba(91,61,245,0.35)]"
          : "border-border hover:shadow-md",
      )}
    >
      <CardHeader className="items-center">
        <CardTitle
          className={cn("text-[15px] font-semibold", isActive ? "text-primary" : "text-foreground")}
        >
          {plan.name}
        </CardTitle>
        {"badge" in plan && plan.badge && (
          <CardAction className="row-span-1 self-center">
            <Badge variant="lime" className="h-auto px-2.5 py-0.5 text-[12px]">
              {plan.badge}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="gap-3">
        <div className="flex items-baseline gap-1">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={price}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="font-heading text-[36px] font-bold tracking-[-0.04em] text-foreground md:text-[44px]"
            >
              {price === 0 ? "Free" : `$${price}`}
            </motion.span>
          </AnimatePresence>
          {price > 0 && <span className="text-[15px] text-muted-foreground">/ seat / month</span>}
        </div>
        <CardDescription className="text-[14px] leading-[22px] md:text-[15px]">
          {plan.description}
        </CardDescription>
      </CardContent>
    </MotionCard>
  );
}

function FeaturesPanel({ plan }: { plan: Plan }) {
  return (
    <MotionCard
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="relative h-full w-full gap-8 rounded-[24px] border-0 bg-night text-white shadow-none ring-0 [--card-spacing:--spacing(8)] md:[--card-spacing:--spacing(10)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/50 blur-[90px]"
      />
      <CardHeader className="relative gap-2">
        <span className="text-[13px] font-semibold tracking-[0.12em] text-lime uppercase">
          {plan.name} includes
        </span>
        <CardTitle className="text-[22px] font-semibold md:text-[26px]">
          Everything you need to listen at scale
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        <ul className="flex flex-col gap-4">
          {plan.features.map((f, i) => (
            <motion.li
              key={f}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.05 * i }}
              className="flex items-center gap-3 text-[15px] text-white/80 md:text-[16px]"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-lime">
                <Check className="size-3 text-foreground" strokeWidth={3} />
              </span>
              {f}
            </motion.li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="relative mt-auto flex-col items-stretch gap-6">
        <Separator className="bg-white/10" />
        <p className="text-[14px] text-white/50">Cancel anytime · No setup fees · Free data import</p>
        <MotionButton
          whileHover="hover"
          whileTap={{ scale: 0.98 }}
          size="xl"
          className="-mt-2 h-auto w-full justify-between px-6 py-4 hover:bg-primary/90"
        >
          {plan.cta}
          <motion.span variants={{ hover: { x: 4 } }} transition={{ duration: 0.3, ease: "easeOut" }}>
            <ArrowRight className="size-5" />
          </motion.span>
        </MotionButton>
      </CardFooter>
    </MotionCard>
  );
}

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("yearly");
  const [selected, setSelected] = useState("growth");
  const [hovered, setHovered] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const activeId = hovered || selected;
  const activePlan = plans.find((p) => p.id === activeId) ?? plans[1];

  const cardProps = (plan: Plan) => ({
    plan,
    isActive: activeId === plan.id,
    billingCycle,
    onClick: () => setSelected(plan.id),
    onMouseEnter: () => setHovered(plan.id),
    onMouseLeave: () => setHovered(null),
  });

  return (
    <section
      id="pricing"
      className="flex w-full justify-center bg-white px-6 py-[80px] md:px-[96px] md:py-[120px]"
    >
      <div className="flex w-full max-w-[1248px] flex-col gap-[48px] md:gap-[64px]">
        <PricingHeader billingCycle={billingCycle} setBillingCycle={setBillingCycle} />

        {isMobile ? (
          <div className="flex flex-col gap-4">
            {plans.map((plan) => (
              <Fragment key={plan.id}>
                <PlanCard {...cardProps(plan)} />
                <AnimatePresence mode="wait">
                  {activeId === plan.id && (
                    <div key={"features-" + plan.id} className="w-full">
                      <FeaturesPanel plan={plan} />
                    </div>
                  )}
                </AnimatePresence>
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="flex items-stretch gap-8">
            <div className="flex w-[46%] flex-col gap-4">
              {plans.map((plan) => (
                <PlanCard key={plan.id} {...cardProps(plan)} />
              ))}
            </div>
            <div className="w-[54%]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeId}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="h-full"
                >
                  <FeaturesPanel plan={activePlan} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
