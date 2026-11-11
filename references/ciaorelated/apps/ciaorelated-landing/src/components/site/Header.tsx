import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle } from "./LanguageToggle";
import { CTALink } from "./CTAButton";
import { useI18n } from "@/lib/i18n";
import { brand } from "@/lib/brand";

export function Header() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const navLinks = [
    { href: "/#features", label: t.nav.features },
    { href: "/#community", label: t.nav.community },
    { href: "/#privacy", label: t.nav.privacy },
    { href: "/#opensource", label: t.nav.opensource },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="font-semibold tracking-tight">
          <span className="text-base text-foreground">{brand.wordmark}</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
          <CTALink href="/kampagne.html" className="hidden md:inline-flex" variant="primary">
            {t.nav.download}
          </CTALink>
          <button
            type="button"
            aria-label="Menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border md:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border/60 bg-background/95 md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 text-sm">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-muted-foreground"
              >
                {l.label}
              </a>
            ))}
            <CTALink href="/kampagne.html" variant="primary" className="self-start">
              {t.nav.download}
            </CTALink>
          </div>
        </div>
      )}
    </header>
  );
}
