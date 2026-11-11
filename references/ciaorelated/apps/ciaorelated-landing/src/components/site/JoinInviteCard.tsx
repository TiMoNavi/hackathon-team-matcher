import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Smartphone, Check } from "lucide-react";
import { CTAButton, CTALink } from "./CTAButton";
import { useI18n } from "@/lib/i18n";
import { brand } from "@/lib/brand";

/**
 * JoinInviteCard
 *
 * Invite / deep-link landing card.
 * The production handoff is implemented in /public/deep-link.js, which reads
 * the stable element IDs and data attributes below.
 *
 * Required element IDs (do not rename):
 *   - statusText, slugText, openApp, copyBtn, appStoreBtn
 */
export function JoinInviteCard({ slug }: { slug: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState(brand.websiteUrl);
  const appScheme = brand.appScheme;
  const oneLinkUrl = brand.oneLinkUrl;
  const iosStoreUrl = brand.iosStoreUrl;
  const androidStoreUrl = brand.androidStoreUrl;

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const encodedSlug = encodeURIComponent(slug || "");
  const link = slug ? `${origin}/join/${encodedSlug}` : `${origin}/join`;
  const fallbackStoreHref = iosStoreUrl || androidStoreUrl || "/kampagne.html";
  const oneLinkHref = useMemo(() => {
    if (!oneLinkUrl || !slug) return "";
    try {
      const url = new URL(oneLinkUrl);
      url.searchParams.set("deep_link_value", slug);
      url.searchParams.set("deep_link_sub1", slug);
      return url.toString();
    } catch {
      return "";
    }
  }, [oneLinkUrl, slug]);
  const openAppHref =
    oneLinkHref || fallbackStoreHref || (slug ? `${appScheme}://join/${encodedSlug}` : `${appScheme}://`);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="glass-card mx-auto w-full max-w-lg rounded-3xl p-8 text-center">
      <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl gradient-hero text-primary-foreground">
        <Smartphone className="h-6 w-6" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{t.join.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t.join.sub}</p>

      <p id="statusText" className="mt-6 text-sm font-medium text-primary">
        {t.join.status}
      </p>

      <div className="mt-6 rounded-xl border border-border bg-background/60 px-4 py-3 text-left">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t.join.slugLabel}
        </div>
        <div
          id="slugText"
          className="mt-1 truncate font-mono text-sm text-foreground"
        >
          {slug || "—"}
        </div>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <CTALink
          id="openApp"
          href={openAppHref}
          variant="primary"
          data-slug={slug}
          data-app-scheme={appScheme}
          data-onelink-url={oneLinkUrl}
          data-ios-store-url={iosStoreUrl}
          data-android-store-url={androidStoreUrl}
        >
          <Smartphone className="h-4 w-4" />
          {t.join.openApp}
        </CTALink>
        <CTALink id="appStoreBtn" href={fallbackStoreHref} variant="secondary">
          <Download className="h-4 w-4" />
          {t.join.download}
        </CTALink>
      </div>

      <CTAButton
        id="copyBtn"
        onClick={handleCopy}
        variant="ghost"
        className="mt-3 w-full border border-border"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? t.join.copied : t.join.copy}
      </CTAButton>

      <p className="mt-6 text-xs text-muted-foreground">{t.join.help}</p>
    </div>
  );
}
