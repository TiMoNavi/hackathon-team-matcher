import { useI18n } from "@/lib/i18n";
import { brand, brandHost } from "@/lib/brand";

export function Footer() {
  const { t, lang } = useI18n();
  const year = new Date().getFullYear();
  const privacyHref = lang === "de" ? "/privacy-de.html" : "/privacy.html";
  const termsHref = lang === "de" ? "/terms-de.html" : "/terms.html";
  const guidelinesHref = lang === "de" ? "/guidelines-de.html" : "/guidelines.html";

  return (
    <footer className="border-t border-border/60 bg-card/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-6 w-6 rounded-lg gradient-hero" aria-hidden />
            <span className="text-foreground">{brand.wordmark}</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">{t.footer.tagline}</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold">{t.footer.product}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><a href="/#features" className="hover:text-foreground">{t.nav.features}</a></li>
            <li><a href="/#community" className="hover:text-foreground">{t.nav.community}</a></li>
            <li><a href="/kampagne.html" className="hover:text-foreground">{t.nav.download}</a></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold">{t.footer.legal}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><a href="/support.html" className="hover:text-foreground">{t.footer.support}</a></li>
            <li><a href={privacyHref} className="hover:text-foreground">{t.footer.privacy}</a></li>
            <li><a href={termsHref} className="hover:text-foreground">{t.footer.terms}</a></li>
            <li><a href={guidelinesHref} className="hover:text-foreground">{t.footer.guidelines}</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-6">
          <span>© {year} {brand.copyrightName}. {t.footer.rights}</span>
          <span>{brandHost}</span>
        </div>
      </div>
    </footer>
  );
}
