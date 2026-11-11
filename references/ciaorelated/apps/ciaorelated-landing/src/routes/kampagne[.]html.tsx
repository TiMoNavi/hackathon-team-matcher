import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Smartphone } from "lucide-react";
import { SiteShell } from "@/components/site/SiteShell";
import { StoreBadges } from "@/components/site/StoreBadges";
import { useI18n } from "@/lib/i18n";
import { brand, brandHost, brandText, brandTitle } from "@/lib/brand";

export const Route = createFileRoute("/kampagne.html")({
  head: () => ({
    meta: [
      { title: brandTitle("Download") },
      { name: "description", content: brandText("Download the ciaorelated app.") },
    ],
  }),
  component: CampaignPage,
});

function CampaignPage() {
  const { t } = useI18n();
  const hasIos = !!brand.iosStoreUrl;
  const hasAndroid = !!brand.androidStoreUrl;
  const hasDownloadLink = hasIos || hasAndroid;
  const primaryDownloadUrl = brand.iosStoreUrl || brand.androidStoreUrl || brand.websiteUrl;

  return (
    <SiteShell>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 hero-glow opacity-70" aria-hidden />
        <div className="relative mx-auto grid max-w-5xl gap-12 px-4 py-20 sm:px-6 md:grid-cols-2 md:items-center">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              <span className="gradient-text">{t.campaign.title}</span>
            </h1>
            <p className="mt-4 max-w-md text-muted-foreground">{t.campaign.sub}</p>
            <StoreBadges iosUrl={brand.iosStoreUrl} androidUrl={brand.androidStoreUrl} className="mt-8" />
            {!hasDownloadLink ? <p className="mt-4 text-xs text-muted-foreground">{t.campaign.noStores}</p> : null}
          </div>
          <div className="flex justify-center">
            <a
              href={primaryDownloadUrl}
              className="glass-card flex aspect-square w-full max-w-xs flex-col items-center justify-center rounded-3xl p-6 text-center transition hover:bg-accent/30"
            >
              <Smartphone className="h-20 w-20 text-foreground" />
              <div className="mt-5 text-sm font-medium">{brandHost}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t.campaign.openOnPhone}</div>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-medium">
                {t.campaign.openLink} <ExternalLink className="h-3.5 w-3.5" />
              </div>
            </a>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
