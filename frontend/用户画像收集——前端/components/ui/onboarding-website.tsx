// components/ui/onboarding-website.tsx
"use client";

/*
 * Onboarding / Website – the first step of a sign-up flow, in a single file.
 * Left, centered in its half: the question, one field with Add (+) and Continue (→), and the domains you've added
 * as chips centered under it – when one is added or removed the others glide over to make room. Right, large and running off the edge of the window: the product's dashboard as a quiet loading
 * state – sidebar, tabs, a chart and a table in placeholder bars – that fills in with your answers. The brand from
 * the first domain lands in the workspace switcher at its top as you type.
 * Enter adds what's in the field (or continues when it's empty), Backspace in an empty field takes the last chip
 * back, every chip has its own remove button. Addresses are cleaned up as you add them: https://, www. and paths
 * go, so "https://www.northwind.com/about" becomes northwind.com.
 * The answers land in the dashboard of an AI assistant: domains as sources in its Knowledge table, being learned
 * from; the company's name on the assistant's card and in its greeting. The Conversations chart's gray bars grow in
 * quietly. Each step brings its part into view – the window glides there from where the step before left it.
 * Built so the next steps (brand name, competitors, …) reuse the same frame: OnboardingFrame, Preview and ChipField
 * are kept apart for that. Focus rings show for the keyboard only; the text field itself only firms its edge.
 * Icons from the Hugeicons free set.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  HelpCircleIcon,
  Logout03Icon,
  Message01Icon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons";

/* ---------- Types ---------- */

export type OnboardingWebsiteProps = {
  /** Domains already known, e.g. from the sign-up email – the first one is the brand's own */
  defaultDomains?: string[];
  /** Types this into the field once on load (for demos and recordings); stops as soon as someone types */
  autoType?: string;
  /** Called with the cleaned-up domains when Continue is pressed */
  onContinue?: (domains: string[]) => void;
  /** Called by Back in the top bar – hidden when left out */
  onBack?: () => void;
  onLogout?: () => void;
  /** The signed-in account, shown top right */
  email?: string;
  /** Your product's name – footer and logo label */
  product?: string;
  /** Your logo, top left – the affectUI mark when left out */
  logo?: ReactNode;
  /** Focus the field when the step opens – on in a real flow, so the keyboard carries on from step to step */
  autoFocus?: boolean;
  /** The dashboard's layout, like the App Shell's: "inset" (main area a rounded panel on the gray page) or "flat"
   *  (edge to edge, split by a hairline). Left out, it follows data-shell="flat" on an ancestor, e.g. <html> */
  layout?: "inset" | "flat";
  /** Where this step sits in the flow: dashes under the question */
  step?: number;
  steps?: number;
  className?: string;
};

/* ---------- Helpers ---------- */

/** "https://www.Northwind.com/about?x" → "northwind.com" */
export const cleanDomain = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
const isDomain = (d: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(d);
/** "northwind.co.uk" → "Northwind", "northwind-industries.com" → "Northwind Industries" */
export const brandFrom = (domain?: string) =>
  (domain?.split(".")[0] ?? "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

export const Icon = ({ icon, size = 16, stroke = 1.6 }: { icon: IconSvgElement; size?: number; stroke?: number }) => (
  <HugeiconsIcon icon={icon} size={size} strokeWidth={stroke} aria-hidden />
);

/** A brand's mark until you have its real favicon: its first letter on a dark tile */
export function Monogram({ name, size = 14 }: { name: string; size?: number }) {
  return (
    <span className="ui-obw-mono" style={{ width: size, height: size, fontSize: size * 0.62 }} aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/* ---------- Screen ---------- */

export function OnboardingWebsiteScreen({
  defaultDomains = [],
  autoType,
  onContinue,
  onBack,
  onLogout,
  email = "alex@northwind.com",
  product = "Lumen",
  logo,
  autoFocus,
  layout,
  step = 1,
  steps = 4,
  className,
}: OnboardingWebsiteProps) {
  const [domains, setDomains] = useState<string[]>(defaultDomains.map(cleanDomain).filter(isDomain));
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const typed = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();

  // Demo typing – one character at a time, then added as a chip; any real keystroke ends it
  useEffect(() => {
    if (!autoType || domains.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDomains([cleanDomain(autoType)]);
      return;
    }
    let i = 0;
    let timer = window.setTimeout(function tick() {
      if (typed.current) return;
      i++;
      setValue(autoType.slice(0, i));
      if (i < autoType.length) timer = window.setTimeout(tick, 70 + Math.random() * 60);
      else
        timer = window.setTimeout(() => {
          if (typed.current) return;
          setDomains((d) => (d.length ? d : [cleanDomain(autoType)]));
          setValue("");
        }, 700);
    }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoType]);

  const pending = cleanDomain(value);
  // The dashboard follows the first domain – or what you're typing, before you've added one
  const brand = brandFrom(domains[0] ?? (isDomain(pending) ? pending : undefined));

  const add = () => {
    if (!pending) return true;
    if (!isDomain(pending)) {
      setError(true);
      return false;
    }
    setDomains((d) => (d.includes(pending) ? d : [...d, pending]));
    setValue("");
    setError(false);
    return true;
  };
  const remove = (d: string) => {
    setDomains((all) => all.filter((x) => x !== d));
    input.current?.focus();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!add()) return;
    const all = pending && isDomain(pending) && !domains.includes(pending) ? [...domains, pending] : domains;
    if (all.length) onContinue?.(all);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    typed.current = true;
    // Enter with text adds it as a chip; Enter on an empty field continues (the form submits)
    if (e.key === "Enter" && value.trim()) {
      e.preventDefault();
      add();
      return;
    }
    if (e.key === "Backspace" && !value && domains.length) setDomains((d) => d.slice(0, -1));
    if ((e.key === "," || e.key === " ") && value) {
      e.preventDefault();
      add();
    }
  };
  const canContinue = domains.length > 0 || isDomain(pending);

  return (
    <OnboardingFrame
      className={className}
      email={email}
      product={product}
      logo={logo}
      autoFocus={autoFocus}
      layout={layout}
      onBack={onBack}
      onLogout={onLogout}
      preview={<Preview brand={brand} domains={domains} pending={isDomain(pending) ? pending : undefined} focus="table" />}
    >
      <Steps step={step} steps={steps} />
      <h1 className="ui-obw-title">What's your company's website?</h1>
      <p className="ui-obw-sub">Your assistant learns from it. Add your docs or help center, too.</p>

      <form className="ui-obw-form" onSubmit={submit} noValidate>
        <ChipField
          chips={domains}
          onRemove={remove}
          brand={brand}
          hint={
            <p id={hintId} className="ui-obw-hint" data-error={error || undefined} aria-live="polite">
              {error ? "That doesn't look like a domain – try northwind.com" : "\u00a0"}
            </p>
          }
        >
          <input
            ref={input}
            className="ui-obw-input"
            value={value}
            onChange={(e) => {
              typed.current = true;
              setValue(e.target.value);
              setError(false);
            }}
            onKeyDown={onKey}
            placeholder={domains.length ? "Add another domain" : "northwind.com"}
            aria-label="Website or docs domain"
            aria-invalid={error || undefined}
            aria-describedby={hintId}
            inputMode="url"
            autoComplete="url"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button type="button" className="ui-obw-btn" aria-label="Add domain" title="Add domain" onClick={() => add()} disabled={!value.trim()}>
            <Icon icon={Add01Icon} size={14} />
          </button>
          <button type="submit" className="ui-obw-btn ui-obw-btn--go" aria-label="Continue" title="Continue" disabled={!canContinue}>
            <Icon icon={ArrowRight02Icon} size={14} />
          </button>
        </ChipField>
      </form>
    </OnboardingFrame>
  );
}

/* ---------- Frame: top bar, the step on the left, the dashboard on the right ---------- */

export function OnboardingFrame({
  children,
  preview,
  email,
  product,
  onBack,
  onLogout,
  logo,
  autoFocus,
  layout,
  className,
}: {
  children: ReactNode;
  preview: ReactNode;
  /** Your logo, top left – the affectUI mark when left out */
  logo?: ReactNode;
  /** Focus the step's first field (or its [data-autofocus] button) when it opens */
  autoFocus?: boolean;
  layout?: "inset" | "flat";
  email: string;
  product: string;
  onBack?: () => void;
  onLogout?: () => void;
  className?: string;
}) {
  const stepRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    stepRef.current?.querySelector<HTMLElement>("[data-autofocus], input:not([disabled])")?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <div className={`ui-obw${className ? ` ${className}` : ""}`} data-layout={layout}>
      <style href="ui-screen-onboarding-website" precedence="default">
        {css}
      </style>
      <header className="ui-obw-top">
        <span className="ui-obw-logo" aria-label={product} role="img">
          {logo ?? <LogoMark />}
        </span>
        {onBack && (
          <button type="button" className="ui-obw-chip-btn" onClick={onBack}>
            <Icon icon={ArrowLeft02Icon} size={14} />
            Back
          </button>
        )}
        <span className="ui-obw-account">
          Logged in as <b>{email}</b>
        </span>
        <button type="button" className="ui-obw-chip-btn" onClick={onLogout}>
          <Icon icon={Logout03Icon} size={14} />
          Log out
        </button>
      </header>

      <div className="ui-obw-preview" aria-hidden>
        {preview}
      </div>

      <main className="ui-obw-main">
        <div ref={stepRef} className="ui-obw-step">
          {children}
        </div>
      </main>

      <footer className="ui-obw-foot">
        <span>© 2026 {product}</span>
        <a href="#terms">Terms</a>
        <a href="#privacy">Privacy</a>
      </footer>
    </div>
  );
}

/** Where you are in the flow – one dash per step, the done ones and the current one dark */
export function Steps({ step, steps }: { step: number; steps: number }) {
  return (
    <div className="ui-obw-steps" role="img" aria-label={`Step ${step} of ${steps}`}>
      {Array.from({ length: steps }, (_, i) => (
        <i key={i} data-on={i < step || undefined} />
      ))}
    </div>
  );
}

/** The field over a soft glow, the added chips centered under it – when one comes or goes the others glide to their new place */
export function ChipField({
  chips,
  onRemove,
  brand,
  hint,
  mark = true,
  label = "Added domains",
  children,
}: {
  chips: string[];
  onRemove: (chip: string) => void;
  brand: string;
  hint?: ReactNode;
  /** A monogram in front of each chip – on for domains, off for names */
  mark?: boolean;
  /** What the chips are, for screen readers */
  label?: string;
  children: ReactNode;
}) {
  const list = useRef<HTMLUListElement>(null);
  const last = useRef(new Map<string, number>());

  // FLIP: remember where every chip sat, and after a change move each one from there to its new place
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    for (const li of Array.from(el.children) as HTMLElement[]) {
      const key = li.dataset.chip!;
      const x = li.getBoundingClientRect().left;
      next.set(key, x);
      const was = last.current.get(key);
      if (was === undefined || reduce || was === x) continue;
      li.animate([{ transform: `translateX(${was - x}px)` }, { transform: "translateX(0)" }], {
        duration: 420,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
    }
    last.current = next;
  }, [chips]);

  return (
    <div className="ui-obw-field">
      <div className="ui-obw-boxwrap">
        <span className="ui-obw-glow" aria-hidden />
        <div className="ui-obw-box">{children}</div>
      </div>
      <ul ref={list} className="ui-obw-chips" aria-label={label}>
        {chips.map((c, i) => (
          <li key={c} data-chip={c} className="ui-obw-chip">
            {mark && <Monogram name={i === 0 ? brand || c : c} />}
            <span className="ui-obw-chip__text" title={c}>{c}</span>
            <button type="button" className="ui-obw-chip__x" aria-label={`Remove ${c}`} onClick={() => onRemove(c)}>
              <Icon icon={Cancel01Icon} size={12} stroke={2} />
            </button>
          </li>
        ))}
      </ul>
      {hint}
    </div>
  );
}

/** The affectUI mark – swap it for your own logo with the logo prop */
export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 107 107" fill="currentColor" aria-hidden>
      <path d="M106.447 67.3367C106.447 69.7104 104.523 71.6348 102.149 71.6348H75.928C73.5542 71.6348 71.6299 73.5591 71.6299 75.9329V102.16C71.6299 104.534 69.7056 106.458 67.3318 106.458H35.8198C35.8185 106.458 35.8174 106.459 35.8174 106.46C35.8174 106.462 35.8163 106.463 35.8149 106.463H4.29811C1.92433 106.463 0 104.539 0 102.165V39.1262C0 36.7525 1.92433 34.8281 4.29811 34.8281H30.5193C32.8931 34.8281 34.8174 32.9038 34.8174 30.53V4.29812C34.8174 1.92433 36.7417 0 39.1155 0H102.149C104.523 0 106.447 1.92433 106.447 4.29811V67.3367ZM35.8174 66.3425C35.8174 68.7163 37.7417 70.6406 40.1155 70.6406H66.3318C68.7056 70.6406 70.6299 68.7163 70.6299 66.3425V40.1155C70.6299 37.7417 68.7056 35.8174 66.3318 35.8174H40.1155C37.7417 35.8174 35.8174 37.7417 35.8174 40.1155V66.3425Z" />
    </svg>
  );
}

/* ---------- Agent mark: affectUI's default agent icon, as in Collaboration Stream ---------- */

/** Twinkle order – a diagonal wave, as in Thinking State */
const WAVE = [0, 120, 240, 120, 240, 360, 240, 360, 480];
/** An agent's own 3×3 pattern, mirrored left to right, from its id – never fewer than five squares */
const pattern = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  for (let k = 0; k < 64; k++) {
    const bits = (h >> (k % 26)) & 63;
    const cells = [0, 1, 2].flatMap((r) => {
      const a = (bits >> (r * 2)) & 1;
      const b = (bits >> (r * 2 + 1)) & 1;
      return [a, b, a];
    });
    if (cells.filter(Boolean).length >= 5) return cells;
    h = (h * 1103515245 + 12345) >>> 0;
  }
  return [1, 0, 1, 0, 1, 0, 1, 0, 1];
};

/**
 * An agent's mark: a small pixel pattern of its own, in its color – it twinkles while the agent writes.
 * `full` draws all nine squares in the ink color: a person, not an agent.
 */
export function AgentMark({ id = "agent", color, busy, full }: { id?: string; color?: string; busy?: boolean; full?: boolean }) {
  const cells = full ? [1, 1, 1, 1, 1, 1, 1, 1, 1] : pattern(id);
  return (
    <span
      className="ui-obw-agent-mark"
      data-busy={busy || undefined}
      data-full={full || undefined}
      style={color ? ({ "--obw-mark": color } as CSSProperties) : undefined}
      aria-hidden
    >
      {cells.map((on, i) => (
        <i key={i} data-on={on ? "" : undefined} style={{ animationDelay: `${WAVE[i]}ms` }} />
      ))}
    </span>
  );
}

/* ---------- Preview: the dashboard as a loading state, filling in with the answers ---------- */

const navGroups = [
  [56, 48],
  [40, 56],
  [60, 52],
  [36, 44],
  [64, 50, 40],
  [52, 44],
  [60, 36, 48],
];
/** Heights of the chart's bars, 0–1 – a quiet, believable rhythm */
const bars = [0.32, 0.4, 0.36, 0.48, 0.44, 0.56, 0.5, 0.42, 0.6, 0.66, 0.58, 0.7, 0.64, 0.52, 0.6, 0.72, 0.78, 0.7, 0.62, 0.74, 0.82, 0.76, 0.68, 0.8, 0.86, 0.78, 0.9, 0.84];

/** Where the dashboard's camera rests for a step: the part the step's answers land in */
export type PreviewFocus = "top" | "agent" | "table" | "chat";

/** How the assistant sounds – its greeting and its replies in the sample chat follow it */
export type Tone = "friendly" | "neutral" | "formal";
/** How long its replies are – the sample chat's answer follows it */
export type ReplyLength = "short" | "balanced" | "detailed";
/** `who` is how it introduces itself – its own name, or "the Northwind assistant" */
const greeting = (who: string, tone: Tone) =>
  ({
    friendly: `Hey! I'm ${who} – what can I help you with today?`,
    neutral: `Hi, I'm ${who} – ask me anything about our products, plans or your account.`,
    formal: `Good day. I am ${who}. How may I assist you?`,
  })[tone];
const sampleReply: Record<Tone, Record<ReplyLength, string>> = {
  friendly: {
    short: "Sure thing – any time!",
    balanced: "Sure thing! You can switch any time – we'll prorate the difference for you.",
    detailed: "Sure thing! You can switch any time under Settings → Plan. We'll prorate the difference, so you only pay for the days you spent on each plan.",
  },
  neutral: {
    short: "Yes, at any time.",
    balanced: "Yes. You can change your plan at any time; the difference is prorated.",
    detailed: "Yes. You can change your plan at any time under Settings → Plan. The difference is prorated, so you pay only for the days on each plan.",
  },
  formal: {
    short: "Certainly, at any time.",
    balanced: "Certainly. Your plan may be changed at any time, and the difference will be prorated accordingly.",
    detailed: "Certainly. Your plan may be changed at any time under Settings → Plan. The difference will be prorated, so that you are charged only for the days on each plan.",
  },
};

const tabLabels = ["Overview", "Conversations", "Knowledge", "Settings"];

/** Where the camera was on the step before – so the next step's dashboard starts there and glides on */
let lastPan: number | null = null;

export function Preview({
  brand,
  aliases = [],
  domains = [],
  pending,
  tone = "neutral",
  length = "balanced",
  agentName,
  handoverTo,
  live,
  focus = "top",
}: {
  /** The company's name – the workspace switcher and the assistant's card */
  brand: string;
  /** Other names the assistant answers to – small tags on its card */
  aliases?: string[];
  /** Domains – the rows of the Knowledge table, being learned from */
  domains?: string[];
  /** A domain still being typed – a faint row under them */
  pending?: string;
  /** How it sounds – the greeting and the sample chat */
  tone?: Tone;
  /** How long its replies are – the sample chat */
  length?: ReplyLength;
  /** Its own name – "<brand> Assistant" when left out */
  agentName?: string;
  /** Who it hands over to when it's unsure – a line under the sample chat */
  handoverTo?: string;
  /** Set up and running: tabs and numbers fill in, Draft turns Live and the loading sheen stops */
  live?: boolean;
  /** The part to bring into view */
  focus?: PreviewFocus;
}) {
  const win = useRef<HTMLDivElement>(null);
  // The assistant "writes" its reply for a moment whenever the tone changes – its mark twinkles
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    setWriting(true);
    const t = window.setTimeout(() => setWriting(false), 900);
    return () => window.clearTimeout(t);
  }, [tone, length]);
  /** Where this window's camera is – null until its first move */
  const pan = useRef<number | null>(null);
  const name = agentName?.trim() || `${brand} Assistant`;
  const rows = [...domains.map((d) => ({ d, faint: false })), ...(pending && !domains.includes(pending) ? [{ d: pending, faint: true }] : [])];

  // The camera: move the window so the focused part sits near the top of the right half – from where the step
  // before left it, or (on the first step) from the top after a beat
  useLayoutEffect(() => {
    const el = win.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const target = el.querySelector<HTMLElement>(`[data-focus="${focus}"]`);
    let top = 0;
    for (let n: HTMLElement | null = target; n && n !== el; n = n.offsetParent as HTMLElement | null) top += n.offsetTop;
    // Never so far that the window's bottom edge comes into view – it always runs on below the right half
    const room = Math.max(0, el.offsetHeight - (box.clientHeight - 24));
    const y = focus === "top" || !target ? 0 : Math.max(0, Math.min(top - 96, room));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = pan.current ?? lastPan ?? 0;
    // The position is only kept once the move starts – an effect that runs twice (Strict Mode) starts from the same place
    const settle = () => {
      pan.current = y;
      lastPan = y;
    };
    el.style.transition = "none";
    el.style.transform = `translateY(${-(reduce ? y : from)}px)`;
    if (reduce || from === y) return settle();
    const t = window.setTimeout(
      () => {
        el.style.transition = "";
        el.style.transform = `translateY(${-y}px)`;
        settle();
      },
      from === 0 && y > 0 ? 700 : 120,
    );
    return () => window.clearTimeout(t);
  }, [focus]);

  return (
    <div ref={win} className="ui-obw-win" data-live={live || undefined}>
      <aside className="ui-obw-side">
        <div className="ui-obw-ws" data-on={brand ? "" : undefined} key={brand || "empty"}>
          {brand ? <Monogram name={brand} size={16} /> : <span className="ui-obw-sk ui-obw-sk--sq" style={{ width: 16, height: 16, borderRadius: 4 }} />}
          {brand ? <span className="ui-obw-ws__name">{brand}</span> : <span className="ui-obw-sk" style={{ width: 64 }} />}
          <span className="ui-obw-ws__dot" />
        </div>
        {navGroups.map((g, gi) => (
          <div key={gi} className="ui-obw-nav">
            <span className="ui-obw-sk" style={{ width: 30, height: 6 }} />
            {g.map((w, i) => (
              <span key={i} className="ui-obw-nav__row">
                <span className="ui-obw-sk ui-obw-sk--sq" />
                <span className="ui-obw-sk" style={{ width: w + 20 }} />
              </span>
            ))}
          </div>
        ))}
      </aside>
      <section className="ui-obw-body">
        <div className="ui-obw-bar">
          <Icon icon={SidebarLeftIcon} size={14} />
          {brand ? <span className="ui-obw-text ui-obw-bar__title">Overview</span> : <span className="ui-obw-sk" style={{ width: 88 }} />}
          <span className="ui-obw-bar__tools">
            <span className="ui-obw-tool"><Icon icon={Message01Icon} size={14} /></span>
            <span className="ui-obw-tool"><Icon icon={HelpCircleIcon} size={14} /></span>
          </span>
        </div>
        <div className="ui-obw-tabs">
          {[96, 72, 112, 88].map((w, i) => (
            <span key={i} className="ui-obw-tab" data-on={live && i === 0 ? "" : undefined}>
              <span className="ui-obw-sk ui-obw-sk--sq" />
              {live ? <span className="ui-obw-text ui-obw-tab__label">{tabLabels[i]}</span> : <span className="ui-obw-sk" style={{ width: w }} />}
            </span>
          ))}
        </div>
        <div className="ui-obw-content">
          <div className="ui-obw-kpis" data-focus="top">
            {[64, 52, 72].map((w, i) => {
              const kpi = live ? [["Knowledge", `${domains.length} ${domains.length === 1 ? "source" : "sources"}`], ["Conversations", "0"], ["Status", "Live"]][i] : null;
              return (
                <div key={i} className="ui-obw-card ui-obw-kpi">
                  {kpi ? <span className="ui-obw-kpi__label" style={{ animationDelay: `${i * 90}ms` }}>{kpi[0]}</span> : <span className="ui-obw-sk" style={{ width: w }} />}
                  {kpi ? (
                    <span className="ui-obw-kpi__value" style={{ animationDelay: `${120 + i * 90}ms` }}>
                      {i === 2 && <i className="ui-obw-live-dot" />}
                      {kpi[1]}
                    </span>
                  ) : (
                    <span className="ui-obw-sk" style={{ width: 44, height: 16, borderRadius: 5 }} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="ui-obw-section" data-focus="agent">
            <div className="ui-obw-head">
              {brand ? <span className="ui-obw-text ui-obw-head__title">Your assistant</span> : <span className="ui-obw-sk" style={{ width: 68, height: 12 }} />}
              <span className="ui-obw-sk" style={{ width: 248 }} />
            </div>
            <div className="ui-obw-card ui-obw-agent">
              <div className="ui-obw-agent__who">
                <AgentMark id={brand || "assistant"} />
                {brand ? (
                  <span className="ui-obw-text">{name}</span>
                ) : (
                  <span className="ui-obw-sk" style={{ width: 120 }} />
                )}
                {live ? (
                  <span className="ui-obw-tag ui-obw-tag--green" key="live">
                    <i className="ui-obw-tag__dot" />
                    Live
                  </span>
                ) : (
                  <span className="ui-obw-tag" key="draft">Draft</span>
                )}
              </div>
              <div className="ui-obw-bubble">
                {brand ? (
                  <span className="ui-obw-say" key={tone}>
                    {greeting(agentName?.trim() ? agentName.trim() : `the ${brand} assistant`, tone)}
                  </span>
                ) : (
                  <>
                    <span className="ui-obw-sk" style={{ width: "80%" }} />
                    <span className="ui-obw-sk" style={{ width: "52%" }} />
                  </>
                )}
              </div>
              <div className="ui-obw-agent__aka">
                {aliases.length ? (
                  <>
                    <span className="ui-obw-agent__label">Also answers to</span>
                    {aliases.slice(0, 3).map((a) => (
                      <span key={a} className="ui-obw-tag ui-obw-tag--blue" title={a}>{a}</span>
                    ))}
                    {aliases.length > 3 && <span className="ui-obw-tag">+{aliases.length - 3}</span>}
                  </>
                ) : (
                  <>
                    <span className="ui-obw-sk" style={{ width: 88 }} />
                    <span className="ui-obw-sk" style={{ width: 56, height: 16, borderRadius: 5 }} />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="ui-obw-section">
            <div className="ui-obw-head">
              {brand ? <span className="ui-obw-text ui-obw-head__title">Conversations</span> : <span className="ui-obw-sk" style={{ width: 68, height: 12 }} />}
              <span className="ui-obw-sk" style={{ width: 248 }} />
            </div>
            <div className="ui-obw-card ui-obw-chart">
              <span className="ui-obw-chart__label">
                <span className="ui-obw-sk ui-obw-sk--sq" />
                <span className="ui-obw-sk" style={{ width: 88 }} />
              </span>
              <div className="ui-obw-chart__plot">
                <span className="ui-obw-chart__axis">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className="ui-obw-sk" style={{ width: 26 }} />
                  ))}
                </span>
                <div className="ui-obw-bars">
                  {bars.map((h, i) => (
                    <i key={i} style={{ height: `${h * 100}%`, animationDelay: `${300 + i * 24}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="ui-obw-section" data-focus="table">
            <div className="ui-obw-head">
              {rows.length ? <span className="ui-obw-text ui-obw-head__title">Knowledge</span> : <span className="ui-obw-sk" style={{ width: 68, height: 12 }} />}
              <span className="ui-obw-sk" style={{ width: 248 }} />
            </div>
            <div className="ui-obw-card ui-obw-table">
              <div className="ui-obw-tr" data-head>
                <span className="ui-obw-td ui-obw-td--dot"><span className="ui-obw-sk" style={{ width: 12, height: 8 }} /></span>
                <span className="ui-obw-td"><span className="ui-obw-sk" style={{ width: 56 }} /></span>
                <span className="ui-obw-td"><span className="ui-obw-sk" style={{ width: 40 }} /></span>
                <span className="ui-obw-td"><span className="ui-obw-sk" style={{ width: 72 }} /></span>
              </div>
              {Array.from({ length: Math.max(6, rows.length) }, (_, r) => {
                const row = rows[r];
                return (
                  <div key={row ? (row.faint ? "pending" : row.d) : `sk${r}`} className="ui-obw-tr" data-filled={row ? "" : undefined} data-faint={row?.faint || undefined}>
                    <span className="ui-obw-td ui-obw-td--dot"><span className="ui-obw-sk" style={{ width: 12, height: 8 }} /></span>
                    <span className="ui-obw-td">
                      {row ? (
                        <>
                          <Monogram name={r === 0 && brand ? brand : row.d} />
                          <span className="ui-obw-text">{row.d}</span>
                        </>
                      ) : (
                        <>
                          <span className="ui-obw-sk ui-obw-sk--sq" />
                          <span className="ui-obw-sk" style={{ width: 104 }} />
                        </>
                      )}
                    </span>
                    <span className="ui-obw-td">
                      {row ? (
                        row.faint ? (
                          <span className="ui-obw-tag">Queued</span>
                        ) : (
                          <span className="ui-obw-tag ui-obw-tag--blue">
                            <i className="ui-obw-tag__dot" />
                            Learning
                          </span>
                        )
                      ) : (
                        <>
                          <span className="ui-obw-sk ui-obw-sk--sq" />
                          <span className="ui-obw-sk" style={{ width: 52 }} />
                        </>
                      )}
                    </span>
                    <span className="ui-obw-td"><span className="ui-obw-sk ui-obw-sk--sq" /><span className="ui-obw-sk" style={{ width: 104 }} /></span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ui-obw-section" data-focus="chat">
            <div className="ui-obw-head">
              {brand ? <span className="ui-obw-text ui-obw-head__title">Test chat</span> : <span className="ui-obw-sk" style={{ width: 68, height: 12 }} />}
              <span className="ui-obw-sk" style={{ width: 248 }} />
            </div>
            <div className="ui-obw-card ui-obw-chat">
              <div className="ui-obw-chat__msg">
                <AgentMark full />
                <span className="ui-obw-bubble ui-obw-bubble--q">Can I change my plan mid-month?</span>
              </div>
              <div className="ui-obw-chat__msg">
                <AgentMark id={brand || "assistant"} busy={writing} />
                <span className="ui-obw-chat__reply">
                  <span className="ui-obw-chat__name">{name}</span>
                  <span className="ui-obw-bubble">
                    <span className="ui-obw-say" key={tone + length}>{sampleReply[tone][length]}</span>
                  </span>
                </span>
              </div>
              <div className="ui-obw-chat__hand">
                {handoverTo ? (
                  <span className="ui-obw-say" key={handoverTo}>
                    Not sure? It hands over to <span className="ui-obw-tag ui-obw-tag--blue">{handoverTo}</span>
                  </span>
                ) : (
                  <span className="ui-obw-say" key="none">It answers everything itself</span>
                )}
              </div>
            </div>
          </div>

          {/* More of the page below – so the camera has room and the window always runs on past the bottom */}
          <div className="ui-obw-pair">
            {[0, 1].map((i) => (
              <div key={i} className="ui-obw-card ui-obw-kpi" style={{ height: 180 }}>
                <span className="ui-obw-sk" style={{ width: 88 }} />
                <span className="ui-obw-sk" style={{ width: 160 }} />
              </div>
            ))}
          </div>
          <div className="ui-obw-section">
            <div className="ui-obw-head">
              <span className="ui-obw-sk" style={{ width: 68, height: 12 }} />
              <span className="ui-obw-sk" style={{ width: 200 }} />
            </div>
            <div className="ui-obw-card ui-obw-table">
              {Array.from({ length: 6 }, (_, r) => (
                <div key={r} className="ui-obw-tr">
                  <span className="ui-obw-td ui-obw-td--dot"><span className="ui-obw-sk" style={{ width: 12, height: 8 }} /></span>
                  <span className="ui-obw-td"><span className="ui-obw-sk ui-obw-sk--sq" /><span className="ui-obw-sk" style={{ width: 120 }} /></span>
                  <span className="ui-obw-td"><span className="ui-obw-sk" style={{ width: 48 }} /></span>
                  <span className="ui-obw-td"><span className="ui-obw-sk" style={{ width: 88 }} /></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
.ui-obw {
  --ui-obw-focus: rgba(0, 96, 226, 0.7);
  --obw-bg: #fff;
  --obw-ink: rgba(0, 0, 0, 0.88);
  --obw-muted: rgba(0, 0, 0, 0.61);
  --obw-faint: rgba(0, 0, 0, 0.45);
  --obw-line: rgba(0, 0, 0, 0.06);
  --obw-card: #fff;
  --obw-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.06), 0 1px 1px -1px rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --obw-shadow-firm: 0 0 0 0.5px rgba(0, 0, 0, 0.14), 0 1px 1px -1px rgba(0, 0, 0, 0.12), 0 2px 6px 0 rgba(0, 0, 0, 0.06);
  --obw-sk: rgba(0, 0, 0, 0.05);
  --obw-side: rgba(0, 0, 0, 0.018);
  --obw-page: #f8f8f8;
  --obw-dark: rgba(0, 0, 0, 0.88);
  --obw-on-dark: #fcfcfc;
  --obw-blue: var(--aui-blue, #0190fe);
  --obw-purple: var(--aui-purple, #a651f0);
  --obw-pink: var(--aui-pink, #ee3e9e);
  --obw-red: var(--aui-danger, #d93a2b);
  --obw-out: cubic-bezier(0.23, 1, 0.32, 1);
  position: relative;
  container: ui-obw / inline-size;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--obw-bg);
  color: var(--obw-ink);
  font: 400 13px/20px var(--font-sans, "Inter", ui-sans-serif, system-ui, sans-serif);
  -webkit-font-smoothing: antialiased;
}
:where(.dark, [data-theme="dark"]) .ui-obw {
  --ui-obw-focus: rgba(77, 141, 255, 0.8);
  --obw-bg: #0f0f10;
  --obw-ink: rgba(255, 255, 255, 0.92);
  --obw-muted: rgba(255, 255, 255, 0.6);
  --obw-faint: rgba(255, 255, 255, 0.42);
  --obw-line: rgba(255, 255, 255, 0.07);
  --obw-card: #18181a;
  --obw-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.08), 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --obw-shadow-firm: 0 0 0 0.5px rgba(255, 255, 255, 0.18), 0 2px 6px 0 rgba(0, 0, 0, 0.4);
  --obw-sk: rgba(255, 255, 255, 0.06);
  --obw-side: rgba(255, 255, 255, 0.015);
  --obw-page: #0e0e10;
  --obw-dark: rgba(255, 255, 255, 0.92);
  --obw-on-dark: #111;
  --obw-blue: var(--aui-blue, #4fb0fe);
  --obw-purple: var(--aui-purple, #b98af0);
  --obw-pink: var(--aui-pink, #f06db5);
  --obw-red: var(--aui-danger, #ff8a7a);
}
.ui-obw :focus-visible { outline: 2px solid var(--ui-obw-focus); outline-offset: 2px; }
:where(.ui-obw) button { font: inherit; color: inherit; cursor: pointer; }
:where(.ui-obw) button:disabled { cursor: default; }

/* ---------- Top bar & footer ---------- */
.ui-obw-top { position: relative; z-index: 2; display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 20px 0 24px; }
.ui-obw-logo { display: grid; place-items: center; margin-right: 4px; color: var(--obw-dark); }
.ui-obw-account { margin-left: auto; font-size: 12px; line-height: 16px; color: var(--obw-faint); }
.ui-obw-account b { font-weight: 400; color: var(--obw-muted); }
.ui-obw-chip-btn {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px 0 8px; border: 0; border-radius: 6px;
  background: var(--obw-card); box-shadow: var(--obw-shadow); font-weight: 500; color: var(--obw-ink);
  transition: box-shadow 160ms ease;
}
.ui-obw-chip-btn svg { color: var(--obw-faint); }
.ui-obw-chip-btn:hover { box-shadow: var(--obw-shadow-firm); }
.ui-obw-foot { position: relative; z-index: 2; display: flex; align-items: center; gap: 16px; height: 48px; padding: 0 24px; font-size: 12px; line-height: 16px; color: var(--obw-faint); }
.ui-obw-foot a { color: inherit; text-decoration: none; }
.ui-obw-foot a:hover { color: var(--obw-muted); }

/* ---------- Layout: the step centered in the left half, the dashboard from the middle off the right edge ---------- */
.ui-obw-main { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; width: 50%; min-height: 0; padding: 24px 40px; }
/* Every step's content sits centered in the left half – a field or a form, its middle is the half's middle */
.ui-obw-step { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; width: 100%; min-width: 0; max-width: 440px; text-align: center; }
.ui-obw-preview {
  position: absolute; z-index: 0; top: 56px; bottom: 0; left: 50%; width: max(1088px, 70%);
  /* The mask cuts everything outside this box – the padding keeps the window's own stroke and shadow inside it */
  padding: 24px 0 0 8px; box-sizing: border-box;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 20px, #000 64%, transparent 96%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 20px, #000 64%, transparent 96%);
  pointer-events: none; user-select: none;
}

/* ---------- The step ---------- */
.ui-obw-steps { display: flex; gap: 4px; margin-bottom: 20px; }
.ui-obw-steps i { width: 16px; height: 3px; border-radius: 2px; background: var(--obw-line); }
.ui-obw-steps i[data-on] { background: var(--obw-dark); }
.ui-obw-title { margin: 0; font-size: 24px; font-weight: 500; line-height: 32px; letter-spacing: -0.24px; color: var(--obw-ink); text-wrap: balance; }
.ui-obw-sub { margin: 6px 0 0; color: var(--obw-muted); text-wrap: balance; }
.ui-obw-form { width: 100%; margin-top: 28px; }
.ui-obw-field { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); text-align: left; }
.ui-obw-boxwrap { position: relative; }
.ui-obw-glow {
  position: absolute; z-index: 0; inset: -14px -24px; border-radius: 40px; filter: blur(28px); opacity: 0.32;
  background:
    radial-gradient(40% 70% at 18% 60%, var(--obw-blue), transparent 70%),
    radial-gradient(40% 70% at 52% 50%, var(--obw-purple), transparent 70%),
    radial-gradient(40% 70% at 86% 45%, var(--obw-pink), transparent 70%);
  animation: ui-obw-drift 9s ease-in-out infinite alternate;
}
:where(.dark, [data-theme="dark"]) .ui-obw-glow { opacity: 0.22; }

/* Chips: centered under the field, one row of room so the step stays centered; no overflow, so no stroke is cut */
.ui-obw-chips { position: relative; z-index: 1; display: flex; flex-wrap: wrap; align-content: flex-start; justify-content: center; gap: 6px; min-height: 26px; margin: 10px 0 0; padding: 0; list-style: none; }
/* The hint hangs under the chips, outside the layout – it never pushes the step off center */
.ui-obw-field > .ui-obw-hint { position: absolute; top: 100%; right: 0; left: 0; }
.ui-obw-chip__text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ui-obw-chip {
  max-width: 100%;
  display: inline-flex; flex: none; align-items: center; gap: 6px; height: 26px; padding: 0 4px 0 6px; border-radius: 7px;
  background: var(--obw-card); box-shadow: var(--obw-shadow); font-weight: 500; white-space: nowrap;
  animation: ui-obw-chip-in 360ms var(--obw-out) both;
}
/* Without a mark (names), the text keeps the same distance to the edge as the × on the other side */
.ui-obw-chip:not(:has(.ui-obw-mono)) { padding-left: 9px; }
.ui-obw-chip__x { display: grid; place-items: center; width: 18px; height: 18px; margin-left: -2px; padding: 0; border: 0; border-radius: 4px; background: none; color: var(--obw-faint); }
.ui-obw-chip__x:hover { background: var(--obw-line); color: var(--obw-ink); }
.ui-obw-chip__x:focus-visible { outline-offset: -2px; }
.ui-obw-mono { display: inline-grid; flex: none; place-items: center; border-radius: 4px; background: var(--obw-dark); color: var(--obw-on-dark); font-weight: 500; line-height: 1; }

.ui-obw-box {
  position: relative; z-index: 1; display: flex; align-items: center; gap: 6px; height: 44px; padding: 0 8px 0 14px; border-radius: 12px;
  background: var(--obw-card); box-shadow: var(--obw-shadow); transition: box-shadow 160ms ease;
}
.ui-obw-box:focus-within { box-shadow: var(--obw-shadow-firm); }
.ui-obw-input:focus-visible { outline: none; outline-offset: 0; }
.ui-obw-input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; background: none; font: inherit; color: var(--obw-ink); }
.ui-obw-input::placeholder { color: var(--obw-faint); opacity: 0.7; }
.ui-obw-input[aria-invalid] { color: var(--obw-red); }
.ui-obw-btn {
  display: grid; flex: none; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px;
  background: var(--obw-card); box-shadow: var(--obw-shadow); color: var(--obw-ink);
  transition: opacity 160ms ease, transform 160ms var(--obw-out), box-shadow 160ms ease;
}
.ui-obw-btn:hover:not(:disabled) { box-shadow: var(--obw-shadow-firm); }
.ui-obw-btn:active:not(:disabled) { transform: scale(0.94); }
.ui-obw-btn:disabled { opacity: 0.45; }
.ui-obw-btn--go { background: var(--obw-dark); color: var(--obw-on-dark); box-shadow: none; }
.ui-obw-btn--go:hover:not(:disabled) { box-shadow: none; opacity: 0.88; }
.ui-obw-hint { min-height: 16px; margin: 12px 0 0; font-size: 12px; line-height: 16px; color: var(--obw-faint); text-align: center; }
.ui-obw-hint[data-error] { color: var(--obw-red); }

/* ---------- The dashboard in placeholders ---------- */
/* Taller than the view: the camera moves it so the part a step fills sits in view */
.ui-obw-win {
  position: relative; display: flex; min-height: 100%; overflow: hidden; border-radius: 12px 0 0 0;
  background: var(--obw-page); box-shadow: var(--obw-shadow);
  transition: transform 1100ms cubic-bezier(0.65, 0, 0.35, 1); will-change: transform;
}
/* One slow light sweeping over it – it's loading, your answers fill it */
.ui-obw-win::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--obw-card) 70%, transparent) 50%, transparent 70%);
  transform: translateX(-100%); animation: ui-obw-sheen 3.2s ease-in-out 1.2s infinite;
}
.ui-obw-sk { display: block; flex: none; height: 8px; border-radius: 4px; background: var(--obw-sk); }
.ui-obw-sk--sq { width: 10px; height: 10px; border-radius: 3px; }
.ui-obw-side { display: grid; align-content: start; gap: 22px; width: 232px; flex: none; padding: 10px 12px; }
.ui-obw-ws {
  display: flex; align-items: center; gap: 8px; height: 32px; margin: 0 -4px; padding: 0 8px; border-radius: 8px;
  font-weight: 500; color: var(--obw-ink);
}
.ui-obw-ws[data-on] > .ui-obw-mono { animation: ui-obw-land 600ms var(--obw-out) both; }
.ui-obw-ws { min-width: 0; }
.ui-obw-ws__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; animation: ui-obw-chip-in 420ms var(--obw-out) both; }
.ui-obw-ws__dot { width: 4px; height: 4px; border-radius: 50%; background: var(--obw-faint); opacity: 0.6; }
.ui-obw-nav { display: grid; gap: 12px; padding: 0 4px; }
.ui-obw-nav__row { display: flex; align-items: center; gap: 10px; }
/* Inset (default): the sidebar sits on the gray page, the main area is a rounded panel beside it */
.ui-obw-body { display: flex; flex: 1; flex-direction: column; min-width: 0; margin: 8px 0 8px 0; border-radius: 10px 0 0 10px; background: var(--obw-card); box-shadow: var(--obw-shadow); }
/* Flat: edge to edge – the sidebar tinted, a hairline between it and the main area */
:is(.ui-obw[data-layout="flat"], [data-shell="flat"] .ui-obw:not([data-layout="inset"])) .ui-obw-win { background: var(--obw-card); }
:is(.ui-obw[data-layout="flat"], [data-shell="flat"] .ui-obw:not([data-layout="inset"])) .ui-obw-side { background: var(--obw-side); box-shadow: inset -0.5px 0 0 var(--obw-line); }
:is(.ui-obw[data-layout="flat"], [data-shell="flat"] .ui-obw:not([data-layout="inset"])) .ui-obw-body { margin: 0; border-radius: 0; background: none; box-shadow: none; }
.ui-obw-bar { display: flex; align-items: center; gap: 12px; height: 48px; flex: none; padding: 0 16px; box-shadow: inset 0 -0.5px 0 var(--obw-line); color: var(--obw-faint); }
.ui-obw-bar__tools { display: flex; gap: 6px; margin-left: auto; }
.ui-obw-tool { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 6px; background: var(--obw-side); box-shadow: 0 0 0 0.5px var(--obw-line); }
.ui-obw-tabs { display: flex; gap: 8px; padding: 10px 16px; box-shadow: inset 0 -0.5px 0 var(--obw-line); }
.ui-obw-tab { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 12px 0 10px; border-radius: 7px; box-shadow: 0 0 0 0.5px var(--obw-line); }
.ui-obw-content { display: grid; gap: 28px; padding: 20px 16px 40px; }
.ui-obw-section { display: grid; gap: 14px; }
.ui-obw-head { display: grid; gap: 8px; min-height: 28px; align-content: start; }
.ui-obw-text { font-weight: 500; color: var(--obw-ink); white-space: nowrap; animation: ui-obw-chip-in 420ms var(--obw-out) both; }
.ui-obw-head__title { font-size: 14px; line-height: 12px; }
.ui-obw-bar__title { font-size: 13px; color: var(--obw-muted); }
.ui-obw-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.ui-obw-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ui-obw-kpi { display: grid; align-content: start; gap: 14px; height: 82px; padding: 16px; }
/* Live: the numbers land one card after another */
.ui-obw-kpi__label { height: 8px; font-size: 12px; line-height: 8px; color: var(--obw-muted); animation: ui-obw-chip-in 420ms var(--obw-out) both; }
.ui-obw-kpi__value { display: inline-flex; align-items: center; gap: 6px; height: 16px; font-size: 18px; font-weight: 500; line-height: 16px; color: var(--obw-ink); font-variant-numeric: tabular-nums; animation: ui-obw-chip-in 520ms var(--obw-out) both; }
.ui-obw-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--aui-green, #5fc88a); animation: ui-obw-pulse 1.6s ease-in-out infinite; }
.ui-obw-tab__label { font-size: 12px; color: var(--obw-muted); }
.ui-obw-tab[data-on] { background: var(--obw-side); }
.ui-obw-tab[data-on] .ui-obw-tab__label { color: var(--obw-ink); }
/* Live: done loading – the sheen stops */
.ui-obw-win[data-live]::after { animation: none; opacity: 0; }
.ui-obw-card { border-radius: 10px; box-shadow: 0 0 0 0.5px var(--obw-line); overflow: hidden; }
.ui-obw-chart__label { display: flex; align-items: center; gap: 8px 16px; height: 36px; padding: 0 14px; box-shadow: inset 0 -0.5px 0 var(--obw-line); }
.ui-obw-chart__plot { display: flex; gap: 14px; height: 210px; padding: 14px 14px 12px; }
.ui-obw-chart__axis { display: flex; flex-direction: column; justify-content: space-between; padding: 0 0 4px; }
/* Bars: quiet gray, growing in one after another – big surfaces stay neutral, color is for small tags only */
.ui-obw-bars {
  display: flex; flex: 1; align-items: flex-end; gap: 6px; min-width: 0; padding-bottom: 4px;
  background: repeating-linear-gradient(to bottom, var(--obw-line) 0 1px, transparent 1px 25%);
}
.ui-obw-bars i {
  flex: 1; min-width: 0; border-radius: 3px 3px 1px 1px; background: var(--obw-sk);
  transform-origin: bottom; animation: ui-obw-bar 800ms var(--obw-out) both;
  transition: background-color 600ms ease;
}
/* The assistant's card: who it is, how it greets, what else it answers to – a fixed height, so nothing moves as it fills */
.ui-obw-agent { display: grid; gap: 14px; height: 168px; align-content: start; padding: 16px; }
.ui-obw-agent__who { display: flex; align-items: center; gap: 10px; height: 28px; min-width: 0; max-width: 420px; }
/* A long name ends in an ellipsis – the tag after it always stays */
.ui-obw-agent__who > .ui-obw-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ui-obw-agent__aka .ui-obw-tag { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
/* The agent mark: a 3×3 pixel pattern in the agent's color (blue unless told otherwise); a person is a full square in ink */
.ui-obw-agent-mark { --obw-mark: rgba(0, 96, 226, 0.78); display: grid; flex: none; grid-template-columns: repeat(3, 3px); grid-auto-rows: 3px; gap: 1.5px; place-content: center; width: 16px; height: 16px; }
:where(.dark, [data-theme="dark"]) .ui-obw-agent-mark { --obw-mark: rgba(77, 141, 255, 0.85); }
.ui-obw-agent-mark i { border-radius: 0.75px; background: var(--obw-mark); opacity: 0; transition: opacity 240ms ease; }
.ui-obw-agent-mark i[data-on] { opacity: 1; }
.ui-obw-agent-mark[data-full] i { background: var(--obw-ink); }
.ui-obw-agent-mark[data-busy] i { animation: ui-obw-pixel 1.2s ease-in-out infinite both; }
.ui-obw-agent-mark[data-busy] i:not([data-on]) { opacity: 0.16; }
.ui-obw-bubble { display: grid; align-content: center; gap: 8px; width: fit-content; max-width: 420px; min-height: 52px; padding: 10px 14px; border-radius: 4px 12px 12px 12px; background: var(--obw-side); box-shadow: 0 0 0 0.5px var(--obw-line); }
.ui-obw-bubble .ui-obw-sk { width: 320px; }
.ui-obw-say { color: var(--obw-ink); animation: ui-obw-chip-in 520ms var(--obw-out) both; }
/* The greeting keeps to two lines, so the card keeps its height with a long name */
.ui-obw-agent .ui-obw-say { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
/* The test chat: a customer's question on the right, the reply in the chosen tone, and who it hands over to */
/* The chat keeps to a column, so the customer's message on the right stays in view where the window runs off the edge */
.ui-obw-chat { display: grid; grid-template-columns: minmax(0, 400px); gap: 12px; height: 252px; align-content: start; padding: 16px; }
.ui-obw-chat__reply { display: grid; gap: 4px; min-width: 0; }
.ui-obw-chat__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-left: 2px; font-size: 12px; font-weight: 500; line-height: 16px; color: var(--obw-muted); }
/* Both messages from the left, each after its sender's mark – so nothing hides where the window runs off the edge */
.ui-obw-chat__msg { display: flex; align-items: flex-start; gap: 10px; }
.ui-obw-chat__msg .ui-obw-agent-mark { margin-top: 10px; }
/* The reply has its name over it – its mark lines up with the bubble, not the name */
.ui-obw-chat__msg:has(.ui-obw-chat__reply) .ui-obw-agent-mark { margin-top: 30px; }
.ui-obw-chat__msg .ui-obw-bubble { min-height: 0; }
.ui-obw-bubble--q { background: var(--obw-card); box-shadow: var(--obw-shadow); color: var(--obw-ink); }
.ui-obw-chat__hand { display: flex; align-items: center; height: 20px; padding-left: 26px; font-size: 12px; color: var(--obw-faint); }
.ui-obw-chat__hand .ui-obw-tag { margin-left: 4px; vertical-align: middle; }
.ui-obw-agent__aka { display: flex; align-items: center; gap: 6px; height: 20px; }
.ui-obw-agent__label { margin-right: 2px; font-size: 12px; color: var(--obw-faint); }
.ui-obw-tag {
  display: inline-flex; flex: none; align-items: center; gap: 5px; height: 18px; padding: 0 6px; border-radius: 5px;
  background: var(--obw-line); color: var(--obw-muted); font-size: 11px; font-weight: 500; line-height: 1; white-space: nowrap;
  animation: ui-obw-chip-in 420ms var(--obw-out) both;
}
.ui-obw-agent__who .ui-obw-tag { margin-left: 2px; }
.ui-obw-tag--green { background: color-mix(in srgb, var(--aui-green, #5fc88a) 14%, transparent); color: var(--aui-success, #1e8a4f); }
:where(.dark, [data-theme="dark"]) .ui-obw-tag--green { color: var(--aui-success, #7dcf9f); }
.ui-obw-tag--blue { background: color-mix(in srgb, var(--obw-blue) 10%, transparent); color: var(--obw-blue); }
.ui-obw-tag__dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: ui-obw-pulse 1.4s ease-in-out infinite; }
.ui-obw-tr { display: grid; grid-template-columns: 44px 200px 120px 1fr; height: 34px; box-shadow: inset 0 -0.5px 0 var(--obw-line); }
.ui-obw-tr[data-head] { height: 36px; background: var(--obw-side); }
.ui-obw-td { display: flex; align-items: center; gap: 8px; padding: 0 12px; box-shadow: inset -0.5px 0 0 var(--obw-line); }
.ui-obw-td:last-child { box-shadow: none; }
.ui-obw-td--dot { justify-content: center; padding: 0; }
.ui-obw-tr[data-filled] .ui-obw-td { animation: ui-obw-chip-in 420ms var(--obw-out) both; }
.ui-obw-tr[data-faint] .ui-obw-td { opacity: 0.45; }


/* Medium: less of the dashboard shows – its sidebar becomes a rail of icons, so the main area's content stays in view */
@container ui-obw (max-width: 1280px) {
  .ui-obw-side { width: 52px; padding: 10px 8px; }
  .ui-obw-ws { justify-content: center; margin: 0; padding: 0; }
  .ui-obw-ws > :not(:first-child), .ui-obw-nav > .ui-obw-sk, .ui-obw-nav__row > .ui-obw-sk:not(.ui-obw-sk--sq) { display: none; }
  .ui-obw-nav { justify-items: center; padding: 0; }
}

/* Narrow: the dashboard steps back behind the step and the step takes the width */
@container ui-obw (max-width: 900px) {
  /* Narrow (tablet and phone): no room beside the step – the dashboard steps aside, the step takes the width */
  .ui-obw-main { width: 100%; padding: 24px 20px; }
  .ui-obw-preview { display: none; }
  .ui-obw-account { display: none; }
  .ui-obw-top { padding: 0 16px; }
  .ui-obw-top > .ui-obw-chip-btn:last-child { margin-left: auto; }
  .ui-obw-foot { padding: 0 20px; }
}
/* Touch: 16px text in fields so iOS doesn't zoom in, and bigger targets for the small buttons */
@media (pointer: coarse) {
  .ui-obw input { font-size: 16px; }
  .ui-obw-box { height: 52px; }
  .ui-obw-btn { width: 36px; height: 36px; border-radius: 10px; }
  .ui-obw-chip { height: 32px; }
  .ui-obw-chip__x { width: 26px; height: 26px; }
  .ui-obw-chip-btn { height: 34px; }
}

@keyframes ui-obw-chip-in { from { opacity: 0; transform: translateY(4px) scale(0.96); filter: blur(2px); } }
@keyframes ui-obw-land { 0% { transform: scale(0.97); } 45% { transform: scale(1.02); } 100% { transform: none; } }
@keyframes ui-obw-sheen { 0% { transform: translateX(-100%); } 60%, 100% { transform: translateX(100%); } }
@keyframes ui-obw-bar { from { transform: scaleY(0); } }
@keyframes ui-obw-pulse { 50% { opacity: 0.35; } }
@keyframes ui-obw-pixel { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
@keyframes ui-obw-drift { to { transform: translateX(12px) scale(1.04); } }
@media (prefers-reduced-motion: reduce) {
  .ui-obw *, .ui-obw *::after { animation: none !important; transition: none !important; }
}
`;

