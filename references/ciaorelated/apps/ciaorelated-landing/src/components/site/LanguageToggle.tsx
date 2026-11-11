import { useI18n, type Lang } from "@/lib/i18n";

const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "de", label: "DE" },
];

export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center rounded-full border border-border bg-card/60 p-0.5 text-xs font-medium"
    >
      {LANGS.map((l) => (
        <button
          key={l.value}
          type="button"
          onClick={() => setLang(l.value)}
          aria-pressed={lang === l.value}
          className={`h-7 min-w-9 rounded-full px-2.5 transition-colors ${
            lang === l.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}