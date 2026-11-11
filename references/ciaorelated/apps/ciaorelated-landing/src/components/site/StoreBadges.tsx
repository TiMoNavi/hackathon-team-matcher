import { cn } from "@/lib/utils";

type StoreBadgesProps = {
  iosUrl?: string;
  androidUrl?: string;
  className?: string;
};

export function StoreBadges({ iosUrl, androidUrl, className }: StoreBadgesProps) {
  if (!iosUrl && !androidUrl) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {iosUrl ? (
        <StoreBadge
          href={iosUrl}
          ariaLabel="Download on the App Store"
          src="/store-badges/app-store.svg"
          alt="Download on the App Store"
        />
      ) : null}
      {androidUrl ? (
        <StoreBadge
          href={androidUrl}
          ariaLabel="Get it on Google Play"
          src="/store-badges/google-play.png"
          alt="Get it on Google Play"
        />
      ) : null}
    </div>
  );
}

function StoreBadge({
  href,
  ariaLabel,
  src,
  alt,
}: {
  href: string;
  ariaLabel: string;
  src: string;
  alt: string;
}) {
  return (
    <a
      href={href}
      aria-label={ariaLabel}
      className="inline-flex h-14 items-center transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      rel="noreferrer"
    >
      <img src={src} alt={alt} className="h-full w-auto" loading="lazy" />
    </a>
  );
}
