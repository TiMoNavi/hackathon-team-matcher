"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { IntegrationOrbit } from "@/components/mockups";
import { MotionButton } from "@/components/motion-primitives";
import { Badge } from "@/components/ui/badge";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
};

export default function Integrations() {
  return (
    <section id="integrations" className="w-full bg-white p-4 md:p-8">
      <div className="relative flex w-full flex-col items-center gap-10 overflow-hidden rounded-[28px] bg-linear-to-b from-white via-muted to-[#E2DAFF] pb-12 pt-12 sm:pb-16 sm:pt-16 md:rounded-[40px] md:pb-24 md:pt-24 lg:flex-row lg:gap-0 lg:pl-16 lg:pr-20">
        <div className="z-20 flex max-w-[520px] flex-col items-center gap-4 px-6 text-center md:gap-6 lg:items-start lg:px-0 lg:text-left">
          <motion.div {...fadeUp} transition={{ duration: 0.6 }}>
            <Badge variant="surface" className="h-auto px-3 py-1 text-[13px]">
              40+ integrations
            </Badge>
          </motion.div>
          <motion.h2
            {...fadeUp}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="font-heading text-[32px] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground sm:text-[40px] md:text-[52px]"
          >
            Works with the tools you already live in
          </motion.h2>
          <motion.p
            {...fadeUp}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            className="text-[16px] leading-[1.6] text-body md:text-[18px]"
          >
            Connect your helpdesk, chat, CRM and issue tracker in minutes. Feedback syncs
            both ways, so status updates reach customers without anyone copy-pasting.
          </motion.p>
          <motion.div {...fadeUp} transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}>
            <MotionButton
              whileHover="hover"
              variant="dark"
              size="xl"
              className="px-7 shadow-2xl shadow-primary/30"
            >
              Browse integrations
              <motion.span variants={{ hover: { x: 5 } }} transition={{ duration: 0.3 }}>
                <ArrowRight className="size-5" />
              </motion.span>
            </MotionButton>
          </motion.div>
        </div>

        <motion.div
          {...fadeUp}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative h-[340px] w-full sm:h-[440px] md:h-[620px] lg:flex-1"
        >
          <IntegrationOrbit />
        </motion.div>
      </div>
    </section>
  );
}
