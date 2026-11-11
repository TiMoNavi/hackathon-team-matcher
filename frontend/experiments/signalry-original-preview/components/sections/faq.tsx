"use client";

import { useState, type ComponentType } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  ChevronRight,
  CreditCard,
  Plus,
  Rocket,
  ShieldCheck,
  type LucideProps,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MotionButton } from "@/components/motion-primitives";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Category = {
  id: string;
  title: string;
  icon: ComponentType<LucideProps>;
  faqs: { question: string; answer: string }[];
};

const categories: Category[] = [
  {
    id: "basics",
    title: "The basics",
    icon: Rocket,
    faqs: [
      {
        question: "Where does Signalry collect feedback from?",
        answer:
          "Anywhere your customers talk to you: live chat, email, helpdesk tickets, sales call notes, NPS and survey tools, app-store reviews and your own public board. Each source is connected in a couple of clicks.",
      },
      {
        question: "How long does setup take?",
        answer:
          "Most teams connect their first channel and see grouped themes in under five minutes. Importing historical feedback usually finishes within an hour.",
      },
      {
        question: "How does the AI decide what’s important?",
        answer:
          "Signalry looks at how many customers mention a topic, how recently, how strongly they feel and, if you connect your CRM, how much revenue is attached. You can adjust the weighting at any time.",
      },
      {
        question: "Can customers see our roadmap?",
        answer:
          "Only if you want them to. You can publish a branded public roadmap and voting board, keep everything internal, or share specific items with specific accounts.",
      },
      {
        question: "Do we have to change our existing tools?",
        answer:
          "No. Signalry sits on top of the tools you already use and syncs updates back to them, so your team keeps working the way it does today.",
      },
      {
        question: "Can we close the loop with customers automatically?",
        answer:
          "Yes. When a roadmap item moves to shipped, Signalry drafts a personalised update and sends it to everyone who asked for it. You just review and hit send.",
      },
    ],
  },
  {
    id: "billing",
    title: "Plans & billing",
    icon: CreditCard,
    faqs: [
      {
        question: "Is the Starter plan really free?",
        answer:
          "Yes, it’s free forever for up to three teammates and two channels. No credit card required to sign up.",
      },
      {
        question: "How does per-seat pricing work?",
        answer:
          "You only pay for teammates who manage feedback. Viewers, stakeholders and customers voting on your board are always free.",
      },
      {
        question: "Can I switch plans later?",
        answer:
          "Anytime. Upgrades take effect immediately and are prorated; downgrades apply at the end of your billing period.",
      },
      {
        question: "Do you offer discounts for startups and non-profits?",
        answer:
          "We do. Eligible startups and non-profits get 50% off Growth for the first year. Reach out to our team to apply.",
      },
    ],
  },
  {
    id: "security",
    title: "Security & privacy",
    icon: ShieldCheck,
    faqs: [
      {
        question: "Is our data used to train AI models?",
        answer:
          "Never. Your feedback is processed only to power your own workspace and is not used to train shared models.",
      },
      {
        question: "Where is data stored?",
        answer:
          "Data is encrypted at rest and in transit, and hosted in the EU or US. You choose the region when you create your workspace.",
      },
      {
        question: "Which compliance standards do you meet?",
        answer:
          "Signalry is SOC 2 Type II certified and GDPR compliant. Our latest reports are available on request.",
      },
      {
        question: "Do you support SSO?",
        answer:
          "Yes. SAML SSO and SCIM provisioning with Okta, Azure AD and Google Workspace are included in the Scale plan.",
      },
    ],
  },
];

const ease = [0.25, 0.1, 0.25, 1] as const;

function SupportCard({ className }: { className: string }) {
  return (
    <Card
      className={cn(
        "relative w-full gap-5 rounded-[20px] border-0 bg-primary text-white shadow-none ring-0",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-lime/40 blur-3xl"
      />
      <CardHeader className="relative gap-2">
        <CardTitle className="text-[22px] leading-tight font-semibold tracking-[-0.03em]">
          Still curious?
        </CardTitle>
        <CardDescription className="text-[15px] leading-[24px] text-white/75">
          Book a 15-minute call and we’ll show you Signalry with your own feedback.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative">
        <MotionButton
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          variant="inverse"
          className="group h-auto w-full justify-between rounded-[12px] px-5 py-3.5 text-[15px] font-semibold"
        >
          Book a call
          <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
        </MotionButton>
      </CardContent>
    </Card>
  );
}

export default function Faq() {
  const [categoryId, setCategoryId] = useState(categories[0].id);

  return (
    <section
      id="faq"
      className="flex w-full justify-center overflow-hidden bg-muted px-[16px] py-[64px] md:px-[96px] md:py-[120px]"
    >
      <div className="flex w-full max-w-[1248px] flex-col gap-[40px] md:gap-[72px]">
        <div className="flex flex-col items-start gap-[16px]">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
            className="max-w-[640px] font-heading text-[34px] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground md:text-[52px]"
          >
            Questions, answered
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1, ease }}
            className="max-w-[560px] text-[16px] leading-[26px] text-muted-foreground md:text-[18px] md:leading-[28px]"
          >
            The things teams usually ask before switching. Can’t find yours? We reply in
            under an hour on weekdays.
          </motion.p>
        </div>

        <Tabs
          orientation="vertical"
          value={categoryId}
          onValueChange={setCategoryId}
          className="w-full flex-col items-start gap-6 lg:flex-row"
        >
          <div className="flex w-full shrink-0 flex-col gap-6 lg:w-[380px]">
            <TabsList className="h-auto w-full flex-col items-stretch gap-2.5 bg-transparent p-0">
              {categories.map((c) => (
                <TabsTrigger
                  key={c.id}
                  value={c.id}
                  className="group/cat h-auto w-full flex-none justify-between rounded-[16px] border border-transparent bg-white/60 p-3.5 text-left text-foreground transition-all duration-300 hover:bg-white data-[state=active]:border-primary data-[state=active]:bg-white data-[state=active]:shadow-[0_10px_30px_-14px_rgba(91,61,245,0.4)]"
                >
                  <span className="flex items-center gap-3.5">
                    <span className="flex size-12 items-center justify-center rounded-[12px] bg-secondary text-primary transition-colors group-data-[state=active]/cat:bg-primary group-data-[state=active]/cat:text-white">
                      <c.icon className="size-5" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-[16px] leading-[24px] font-semibold">{c.title}</span>
                      <span className="text-[14px] leading-[22px] font-normal text-muted-foreground">
                        {c.faqs.length} questions
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="ml-auto size-5 text-muted-foreground transition-all duration-300 group-data-[state=active]/cat:translate-x-0.5 group-data-[state=active]/cat:text-primary" />
                </TabsTrigger>
              ))}
            </TabsList>
            <SupportCard className="hidden lg:flex" />
          </div>

          <div className="flex w-full flex-col gap-4 lg:flex-1 lg:pl-8">
            {categories.map((c) => (
              <TabsContent key={c.id} value={c.id} className="w-full">
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease }}
                >
                  <Accordion type="single" collapsible defaultValue="0" className="gap-3">
                    {c.faqs.map((faq, i) => (
                      <AccordionItem
                        key={faq.question}
                        value={String(i)}
                        className="rounded-[18px] border border-border bg-white transition-colors duration-300 hover:border-primary/30 data-[state=open]:border-primary/30"
                      >
                        <AccordionTrigger className="group/q gap-4 p-5 font-heading text-[17px] leading-snug font-semibold tracking-[-0.02em] text-foreground hover:no-underline aria-expanded:pb-2.5 aria-expanded:text-primary md:p-6 md:text-[20px] md:aria-expanded:pb-2.5 **:data-[slot=accordion-trigger-icon]:hidden!">
                          {faq.question}
                          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-secondary text-primary transition-all duration-300 group-aria-expanded/q:rotate-45 group-aria-expanded/q:bg-foreground group-aria-expanded/q:text-lime">
                            <Plus className="size-4" />
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="px-5 pb-5 text-[15px] leading-[24px] text-muted-foreground md:px-6 md:pb-6 md:text-[16px]">
                          {faq.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </motion.div>
              </TabsContent>
            ))}
            <SupportCard className="mt-4 flex lg:hidden" />
          </div>
        </Tabs>
      </div>
    </section>
  );
}
