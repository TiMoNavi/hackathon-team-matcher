"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, type Transition } from "motion/react";
import {
  ChevronDown,
  Headset,
  Kanban,
  Menu,
  Rocket,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

const navItems = [
  { name: "Platform", href: "#features" },
  { name: "Integrations", href: "#integrations" },
  { name: "Pricing", href: "#pricing" },
  { name: "FAQ", href: "#faq" },
];

const useCases: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Product teams",
    description: "Build what customers ask for.",
    icon: Kanban,
  },
  {
    title: "Customer success",
    description: "Close the loop with every account.",
    icon: Headset,
  },
  {
    title: "Founders",
    description: "Hear every customer from day one.",
    icon: Rocket,
  },
];

const spring: Transition = { duration: 0.6, ease: [0.22, 0.68, 0, 1.2] };

const navLinkClass = cn(
  navigationMenuTriggerStyle(),
  "h-auto rounded-lg bg-transparent px-3 py-2 text-[15px] font-normal text-body hover:bg-secondary hover:text-primary focus:bg-secondary data-open:bg-secondary data-open:text-primary data-open:hover:bg-secondary",
);

function MobileLink({
  item,
  onNavigate,
}: {
  item: { name: string; href: string };
  onNavigate: () => void;
}) {
  return (
    <a
      href={item.href}
      onClick={onNavigate}
      className="rounded-lg px-3 py-3 text-[17px] font-medium text-foreground hover:bg-muted"
    >
      {item.name}
    </a>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="relative z-[100] mt-4 w-[calc(100%-32px)] max-w-[1248px] rounded-2xl border border-white/70 bg-white/70 shadow-[0_8px_30px_-12px_rgba(37,22,120,0.2)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="text-[20px] md:text-[22px]">
            <Logo />
          </Link>

          <NavigationMenu viewport={false} className="hidden lg:flex">
            <NavigationMenuList className="gap-1">
              <NavigationMenuItem>
                <NavigationMenuLink asChild className={navLinkClass}>
                  <a href={navItems[0].href}>{navItems[0].name}</a>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuTrigger className={cn(navLinkClass, "[&>svg]:size-4")}>
                  Use cases
                </NavigationMenuTrigger>
                {/* Sized to the longest line so descriptions stay on one line;
                    md:w-max beats the component's own md:w-auto. */}
                <NavigationMenuContent className="w-max rounded-2xl! border border-border p-2! pr-4! shadow-[0_20px_50px_-20px_rgba(37,22,120,0.35)]! ring-0! md:w-max">
                  <ul className="grid gap-1">
                    {useCases.map((u) => (
                      <li key={u.title}>
                        <NavigationMenuLink
                          href="#"
                          className="group/uc items-start gap-3 rounded-xl p-2.5 hover:bg-muted focus:bg-muted"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary transition-colors group-hover/uc:bg-primary group-hover/uc:text-white">
                            <u.icon className="size-4" />
                          </span>
                          <span className="flex flex-col gap-0.5">
                            <span className="text-[14px] leading-5 font-semibold text-foreground group-hover/uc:text-primary">
                              {u.title}
                            </span>
                            <span className="text-[13px] leading-[18px] whitespace-nowrap text-muted-foreground">
                              {u.description}
                            </span>
                          </span>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              {navItems.slice(1).map((item) => (
                <NavigationMenuItem key={item.name}>
                  <NavigationMenuLink asChild className={navLinkClass}>
                    <a href={item.href}>{item.name}</a>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>

          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              className="hidden h-auto px-3 py-2 text-[15px] font-normal text-body hover:bg-transparent hover:text-primary lg:inline-flex"
            >
              <Link href="/login">Sign in</Link>
            </Button>
            <Button
              variant="dark"
              className="hidden h-auto rounded-xl px-4 py-2.5 text-[15px] hover:shadow-[0_6px_20px_rgba(91,61,245,0.35)] lg:inline-flex"
            >
              Start free
            </Button>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle menu"
                className="text-foreground hover:bg-transparent hover:text-primary lg:hidden [&_svg]:size-6!"
              >
                {open ? <X /> : <Menu />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="overflow-hidden border-t border-border data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down lg:hidden">
          <div className="flex flex-col gap-1 p-4">
            <MobileLink item={navItems[0]} onNavigate={() => setOpen(false)} />

            <Collapsible>
              <CollapsibleTrigger className="group/uc flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-[17px] font-medium text-foreground hover:bg-muted data-[state=open]:text-primary">
                Use cases
                <ChevronDown className="size-5 text-muted-foreground transition-transform duration-300 group-data-[state=open]/uc:rotate-180 group-data-[state=open]/uc:text-primary" />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                <ul className="mt-1 mb-2 ml-2 grid gap-1 border-l-2 border-secondary pl-2">
                  {useCases.map((u) => (
                    <li key={u.title}>
                      <a
                        href="#"
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 rounded-xl p-2.5 hover:bg-muted"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                          <u.icon className="size-4" />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[15px] leading-5 font-semibold text-foreground">
                            {u.title}
                          </span>
                          <span className="text-[13px] leading-[18px] whitespace-nowrap text-muted-foreground">
                            {u.description}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>

            {navItems.slice(1).map((item) => (
              <MobileLink key={item.name} item={item} onNavigate={() => setOpen(false)} />
            ))}
            <Button size="xl" className="mt-3 h-auto w-full py-3.5">
              Start free
            </Button>
            <Button
              asChild
              variant="ghost"
              className="h-auto py-3 text-[17px] font-medium hover:bg-transparent"
            >
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </CollapsibleContent>
      </motion.nav>
    </Collapsible>
  );
}
