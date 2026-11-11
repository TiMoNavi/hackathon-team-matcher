"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Star } from "lucide-react";
import { PersonAvatar } from "@/components/mockups";
import { MotionButton } from "@/components/motion-primitives";
import { Badge } from "@/components/ui/badge";

type Testimonial = { name: string; text: string; highlight: string };

function TestimonialPill({ testimonial, i }: { testimonial: Testimonial; i: number }) {
  const [before, rest] = testimonial.text.split(testimonial.highlight);
  // Pull trailing punctuation into the highlight so it doesn't sit alone after it.
  const punct = /^[.,!?]/.test(rest) ? rest[0] : "";
  const highlight = testimonial.highlight + punct;
  const after = rest.slice(punct.length);
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0 14px 30px -12px rgba(37,22,120,0.25)" }}
      className="inline-flex h-[48px] flex-shrink-0 items-center gap-3 whitespace-nowrap rounded-full border border-border bg-white py-1.5 pl-1.5 pr-5 transition-all duration-300 md:h-[56px]"
    >
      <PersonAvatar name={testimonial.name} i={i} size={36} />
      <span className="text-[15px] leading-none text-body md:text-[18px]">
        {before}
        <Badge
          variant="lime"
          className="mx-[2px] h-auto rounded-[6px] px-[6px] py-[2px] align-baseline text-[length:inherit] leading-none font-medium"
        >
          {highlight}
        </Badge>
        {after}
      </span>
    </motion.div>
  );
}

function Placeholder() {
  return (
    <div className="h-[48px] w-[140px] flex-shrink-0 rounded-full border border-dashed border-primary/25 bg-muted md:h-[56px] md:w-[200px]" />
  );
}

/** A row that sways left and right, flanked by empty placeholder pills. */
function SwayRow({
  testimonials,
  offset,
  range = 100,
  speed = 15,
}: {
  testimonials: Testimonial[];
  offset: number;
  range?: number;
  speed?: number;
}) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const distance = isMobile ? range * 0.4 : range;

  return (
    <div className="flex w-full justify-center overflow-hidden">
      <motion.div
        className="flex items-center gap-3 whitespace-nowrap md:gap-4"
        animate={{ x: [-distance, distance] }}
        transition={{ duration: speed, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Placeholder key={"start-" + i} />
        ))}
        {testimonials.map((t, i) => (
          <TestimonialPill key={t.name} testimonial={t} i={offset + i} />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <Placeholder key={"end-" + i} />
        ))}
      </motion.div>
    </div>
  );
}

const rows: { testimonials: Testimonial[]; range: number; speed: number }[] = [
  {
    range: 70,
    speed: 13,
    testimonials: [
      {
        name: "Hana Kim",
        text: "We cut our triage time in half within a week.",
        highlight: "in half",
      },
      {
        name: "Diego Ruiz",
        text: "Finally, one place for every customer request.",
        highlight: "one place",
      },
    ],
  },
  {
    range: 90,
    speed: 17,
    testimonials: [
      { name: "Olivia Park", text: "The AI themes are scarily accurate.", highlight: "scarily accurate" },
      {
        name: "Marcus Lee",
        text: "Our roadmap reviews are now 20 minutes, not two hours.",
        highlight: "20 minutes",
      },
      { name: "Aisha Khan", text: "Setup took less time than my coffee.", highlight: "less time" },
    ],
  },
  {
    range: 110,
    speed: 21,
    testimonials: [
      {
        name: "Ben Carter",
        text: "Customers love hearing back when we ship.",
        highlight: "hearing back",
      },
      {
        name: "Sofia Rossi",
        text: "Sales finally trusts the product roadmap.",
        highlight: "trusts the product roadmap",
      },
      { name: "Noah Fischer", text: "Duplicate merging alone is worth it.", highlight: "worth it" },
    ],
  },
  {
    range: 60,
    speed: 15,
    testimonials: [
      {
        name: "Emma Wright",
        text: "It feels like having an analyst on the team.",
        highlight: "an analyst",
      },
      { name: "Kenji Sato", text: "Clean, fast and genuinely delightful.", highlight: "genuinely delightful" },
      {
        name: "Lena Novak",
        text: "We spotted a churn risk weeks earlier.",
        highlight: "weeks earlier",
      },
    ],
  },
  {
    range: 120,
    speed: 24,
    testimonials: [
      {
        name: "Ravi Patel",
        text: "The public board doubled our feedback volume.",
        highlight: "doubled",
      },
      { name: "Chloe Martin", text: "Best tool we added to our stack this year.", highlight: "Best tool" },
    ],
  },
];

// Running index so every avatar in the wall gets its own color.
const rowOffsets = rows.map((_, i) =>
  rows.slice(0, i).reduce((sum, r) => sum + r.testimonials.length, 0),
);

export default function Testimonials() {
  return (
    <section className="flex w-full flex-col items-center overflow-hidden bg-white py-[80px] md:py-[120px]">
      <div className="mb-[40px] flex max-w-[860px] flex-col items-center gap-4 px-6 text-center md:mb-[72px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-2 text-[14px] font-medium text-body"
        >
          <span className="flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-[#FBBF24] text-[#FBBF24]" />
            ))}
          </span>
          4.9 average from 1,200+ reviews
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="font-heading text-[34px] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground md:text-[56px]"
        >
          Teams that listen, ship better
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="max-w-[640px] text-[16px] leading-[26px] text-muted-foreground md:text-[18px] md:leading-[28px]"
        >
          From two-person startups to global product orgs, here’s what people say after
          switching to Signalry.
        </motion.p>
      </div>

      <div className="relative flex w-full flex-col gap-4">
        {rows.map((row, i) => (
          <SwayRow
            key={i}
            offset={rowOffsets[i]}
            testimonials={row.testimonials}
            range={row.range}
            speed={row.speed}
          />
        ))}
      </div>

      <div className="mt-[40px] flex w-full justify-center px-6 md:mt-[72px]">
        <MotionButton
          whileHover="hover"
          whileTap={{ scale: 0.98 }}
          variant="outline"
          size="xl"
          className="shadow-sm hover:border-primary hover:bg-background hover:text-primary hover:shadow-md"
        >
          Read customer stories
          <motion.span variants={{ hover: { x: 4 } }} transition={{ duration: 0.3, ease: "easeOut" }}>
            <ArrowRight className="size-5" />
          </motion.span>
        </MotionButton>
      </div>
    </section>
  );
}
