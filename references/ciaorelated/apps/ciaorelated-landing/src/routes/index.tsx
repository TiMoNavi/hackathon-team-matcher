import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  ShieldCheck,
  Github,
  Heart,
  Sparkles,
} from "lucide-react";
import { SiteShell } from "@/components/site/SiteShell";
import { CTALink } from "@/components/site/CTAButton";
import { StoreBadges } from "@/components/site/StoreBadges";
import { PhoneMockup } from "@/components/site/PhoneMockup";
import { FeatureSection } from "@/components/site/FeatureSection";
import { useI18n } from "@/lib/i18n";
import { brand, brandText, brandTitle } from "@/lib/brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: brandTitle("Social moments for real communities") },
      {
        name: "description",
        content:
          brandText("Group chats, shared moments and event feeds in one place. Create spaces for friends, families and local communities."),
      },
      { property: "og:title", content: brand.appName },
      {
        property: "og:description",
        content: brandText("Group chats, shared moments and event feeds in one place."),
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useI18n();
  return (
    <SiteShell>
      <Hero />
      <SocialProof />
      <div id="features">
        <FeatureSection
          eyebrow="Moments"
          title={t.sections.feedTitle}
          description={t.sections.feedSub}
          media={<FeedMockup />}
        />
      </div>
      <div id="community">
        <FeatureSection
          eyebrow="Groups"
          title={t.sections.groupsTitle}
          description={t.sections.groupsSub}
          media={<ChatMockup />}
          reverse
        />
        <FeatureSection
          eyebrow="Events"
          title={t.sections.eventsTitle}
          description={t.sections.eventsSub}
          media={<EventsMockup />}
        />
      </div>
      <FeatureSection
        eyebrow="Invite"
        title={t.sections.inviteTitle}
        description={t.sections.inviteSub}
        media={<InviteMockup />}
        reverse
      />
      <div id="privacy">
        <TrustBand />
      </div>
      <div id="opensource">
        <OpenSourceBand />
      </div>
      <DownloadCTA />
    </SiteShell>
  );
}

function Hero() {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 hero-glow opacity-80" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-6 md:grid-cols-2 md:gap-8 md:pb-28 md:pt-24">
        <div className="flex flex-col justify-center">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> {t.hero.eyebrow}
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            <span className="gradient-text">{t.hero.title}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">{t.hero.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CTALink href="/kampagne.html" variant="primary">{t.hero.ctaPrimary}</CTALink>
            <CTALink href="#features" variant="secondary">{t.hero.ctaSecondary}</CTALink>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">{t.hero.tag}</p>
        </div>
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 -z-10 hero-glow blur-2xl" aria-hidden />
          <div className="relative flex items-end gap-4">
            <PhoneMockup className="hidden scale-90 sm:block" rotate={-6}>
              <ScreenshotPhone src="/screenshots-optimized/createstory.jpg" alt="ciaorelated create story screen" />
            </PhoneMockup>
            <PhoneMockup className="scale-100">
              <ScreenshotPhone src="/screenshots-optimized/feed.jpg" alt="ciaorelated feed screen" />
            </PhoneMockup>
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialProof() {
  const items = [
    "Real groups",
    "Shared moments",
    "Local events",
    "Family circles",
    "Open source",
  ];
  return (
    <div className="border-y border-border/60 bg-card/30">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-5 text-xs uppercase tracking-[0.18em] text-muted-foreground sm:px-6">
        {items.map((i) => (
          <span key={i}>{i}</span>
        ))}
      </div>
    </div>
  );
}

function FeedMockup() {
  return (
    <PhoneMockup className="md:ml-auto">
      <ScreenshotPhone src="/screenshots-optimized/moments.jpg" alt="ciaorelated moments screen" />
    </PhoneMockup>
  );
}

function ScreenshotPhone({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
    />
  );
}

function ChatMockup() {
  return (
    <PhoneMockup>
      <ScreenshotPhone src="/screenshots-optimized/chat.jpg" alt="ciaorelated chat screen" />
    </PhoneMockup>
  );
}

function EventsMockup() {
  return (
    <PhoneMockup className="md:ml-auto">
      <ScreenshotPhone src="/screenshots-optimized/communityfeed.jpg" alt="ciaorelated community feed screen" />
    </PhoneMockup>
  );
}

function InviteMockup() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <PhoneMockup>
        <ScreenshotPhone src="/screenshots-optimized/profile.jpg" alt="ciaorelated profile screen" />
      </PhoneMockup>
      <div className="pointer-events-none absolute -inset-10 -z-10 hero-glow blur-3xl" aria-hidden />
    </div>
  );
}

function TrustBand() {
  const { t } = useI18n();
  const items = [
    { icon: ShieldCheck, title: t.sections.trustPrivateTitle, text: t.sections.trustPrivateSub },
    { icon: Users, title: t.sections.trustModerationTitle, text: t.sections.trustModerationSub },
    { icon: Heart, title: t.sections.trustNoTrapsTitle, text: t.sections.trustNoTrapsSub },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.sections.trustTitle}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{t.sections.trustSub}</p>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {items.map((i) => (
          <div key={i.title} className="glass-card rounded-2xl p-6">
            <i.icon className="h-5 w-5 text-primary" />
            <h3 className="mt-3 text-base font-semibold">{i.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{i.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function OpenSourceBand() {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="glass-card flex flex-col items-start gap-6 rounded-3xl p-8 md:flex-row md:items-center md:justify-between md:p-10">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground">
            <Github className="h-3.5 w-3.5" /> Open source
          </span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{t.sections.ossTitle}</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t.sections.ossSub}</p>
        </div>
        <CTALink href={brand.githubRepoUrl} target="_blank" rel="noreferrer" variant="primary">
          <Github className="h-4 w-4" />
          {t.sections.ossCta}
        </CTALink>
      </div>
    </section>
  );
}

function DownloadCTA() {
  const { t } = useI18n();
  const hasIos = !!brand.iosStoreUrl;
  const hasAndroid = !!brand.androidStoreUrl;
  const hasDownloadLink = hasIos || hasAndroid;

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 hero-glow opacity-70" aria-hidden />
      <div className="relative mx-auto max-w-4xl px-4 pb-24 pt-10 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
          <span className="gradient-text">{t.sections.downloadTitle}</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{t.sections.downloadSub}</p>
        <StoreBadges iosUrl={brand.iosStoreUrl} androidUrl={brand.androidStoreUrl} className="mt-8 justify-center" />
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {!hasDownloadLink ? <CTALink href="/kampagne.html" variant="primary">{t.nav.download}</CTALink> : null}
          <CTALink href="/support.html" variant="secondary">{t.footer.support}</CTALink>
        </div>
        {!hasDownloadLink ? <p className="mt-4 text-xs text-muted-foreground">{t.campaign.noStores}</p> : null}
      </div>
    </section>
  );
}
