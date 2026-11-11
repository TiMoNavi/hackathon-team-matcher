import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SiteShell } from "./SiteShell";
import { useI18n } from "@/lib/i18n";

export function LegalPageLayout({
  title,
  lastUpdated,
  children,
  related,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
  related?: { href: string; label: string }[];
}) {
  const { t } = useI18n();
  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.legal.backHome}
        </Link>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight">{title}</h1>
        {lastUpdated ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t.legal.lastUpdated}: {lastUpdated}
          </p>
        ) : null}
        <article className="prose-legal mt-10 space-y-8 text-[15px] leading-relaxed text-foreground/90">
          {children}
        </article>
        {related && related.length > 0 && (
          <nav className="mt-12 flex flex-wrap gap-3 border-t border-border pt-6 text-sm">
            {related.map((r) => (
              <a
                key={r.href}
                href={r.href}
                className="rounded-full border border-border bg-card/50 px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                {r.label}
              </a>
            ))}
          </nav>
        )}
      </div>
    </SiteShell>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
      <div className="space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}
