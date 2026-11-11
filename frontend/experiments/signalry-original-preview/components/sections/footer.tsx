"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { MotionButton } from "@/components/motion-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Facebook, Instagram, Linkedin, Twitter } from "@/components/social-icons";

const socials = [
  { icon: Twitter, label: "X / Twitter" },
  { icon: Linkedin, label: "LinkedIn" },
  { icon: Instagram, label: "Instagram" },
  { icon: Facebook, label: "Facebook" },
];

const linkGroups: Record<string, { name: string; href: string }[]> = {
  Product: [
    { name: "Overview", href: "#features" },
    { name: "Signalry AI", href: "#ai" },
    { name: "Roadmaps", href: "#" },
    { name: "Integrations", href: "#integrations" },
    { name: "Pricing", href: "#pricing" },
  ],
  "Use cases": [
    { name: "Product teams", href: "#" },
    { name: "Customer success", href: "#" },
    { name: "Founders", href: "#" },
    { name: "Agencies", href: "#" },
  ],
  Resources: [
    { name: "Help center", href: "#faq" },
    { name: "Changelog", href: "#" },
    { name: "Templates", href: "#" },
    { name: "Blog", href: "#" },
    { name: "Status", href: "#" },
  ],
  Company: [
    { name: "About", href: "#" },
    { name: "Careers", href: "#" },
    { name: "Press kit", href: "#" },
    { name: "Contact", href: "#" },
  ],
};

export default function Footer() {
  return (
    <footer className="flex w-full flex-col items-center bg-white">
      <div className="w-full p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative flex w-full flex-col items-center overflow-hidden rounded-[28px] bg-primary px-6 py-16 text-center md:rounded-[40px] md:py-24"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
              backgroundSize: "24px 24px",
              maskImage: "radial-gradient(ellipse at center, black 20%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 75%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 left-1/2 h-72 w-[700px] -translate-x-1/2 rounded-full bg-[#9D8CFF]/70 blur-[100px]"
          />
          <h2 className="relative max-w-[760px] font-heading text-[34px] font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-[44px] md:text-[60px]">
            Your customers are already telling you what to build.
          </h2>
          <p className="relative mt-5 max-w-[520px] text-[16px] leading-[1.6] text-white/75 md:text-[18px]">
            Start listening today. It’s free for small teams and takes five minutes to
            set up.
          </p>
          <div className="relative mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <MotionButton
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              variant="lime"
              size="xl"
              className="h-auto px-8 py-3.5 font-bold"
            >
              Start free <ArrowRight />
            </MotionButton>
            <MotionButton
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              variant="outline-inverse"
              size="xl"
              className="h-auto px-8 py-3.5 font-bold"
            >
              Book a demo
            </MotionButton>
          </div>
        </motion.div>
      </div>

      <div className="flex w-full max-w-[1248px] flex-col items-start gap-[56px] px-[32px] py-[60px] md:px-[80px] md:py-[80px] lg:flex-row lg:gap-[120px] lg:px-0">
        <div className="flex w-full shrink-0 flex-col gap-[28px] lg:w-[380px]">
          <span className="text-[24px]">
            <Logo />
          </span>
          <p className="max-w-[340px] text-[15px] leading-[24px] text-muted-foreground">
            The customer feedback platform for teams that would rather build the right
            thing than argue about it.
          </p>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex w-full max-w-[380px] items-center gap-[8px] rounded-[14px] border border-border bg-muted p-[4px]"
          >
            <Input
              type="email"
              placeholder="Your work email"
              aria-label="Email address"
              className="h-auto flex-1 border-none bg-transparent px-3 text-[14px] shadow-none focus-visible:ring-0 md:text-[14px]"
            />
            <Button
              type="submit"
              variant="dark"
              className="h-auto rounded-[10px] px-[18px] py-[10px] text-[14px] font-semibold"
            >
              Subscribe
            </Button>
          </form>
        </div>

        <div className="grid w-full grid-cols-2 gap-x-[32px] gap-y-[40px] sm:grid-cols-4 lg:flex-1">
          {Object.entries(linkGroups).map(([title, links]) => (
            <div key={title} className="flex flex-col gap-[20px]">
              <h4 className="text-[14px] font-semibold uppercase tracking-[0.1em] text-foreground">
                {title}
              </h4>
              <ul className="flex flex-col gap-[12px]">
                {links.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      className="text-[15px] text-muted-foreground transition-colors hover:text-primary"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-[1248px] px-[32px] pb-[40px] md:px-[80px] lg:px-0">
        <Separator className="mb-[28px]" />
        <div className="flex flex-col-reverse items-start justify-between gap-[20px] md:flex-row md:items-center">
          <div className="flex flex-col gap-2 text-[14px] text-muted-foreground md:flex-row md:items-center md:gap-6">
            <span>© 2026 Signalry Inc.</span>
            <a href="#" className="hover:text-primary">
              Terms
            </a>
            <a href="#" className="hover:text-primary">
              Privacy
            </a>
            <a href="#" className="hover:text-primary">
              Cookies
            </a>
          </div>
          <div className="flex items-center gap-[10px]">
            {socials.map(({ icon: Icon, label }) => (
              <Button
                key={label}
                asChild
                variant="outline"
                size="icon"
                className="size-[34px] rounded-full text-muted-foreground shadow-none hover:border-primary hover:bg-primary hover:text-white"
              >
                <a href="#" aria-label={label}>
                  <Icon className="size-[14px]" />
                </a>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
