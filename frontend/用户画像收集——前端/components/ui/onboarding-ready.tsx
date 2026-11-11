// components/ui/onboarding-ready.tsx
"use client";

/*
 * Onboarding / Ready – the last step of setting up an AI assistant, in the same frame as Onboarding / Website.
 * Left, centered in its half: the assistant is ready – what it learned from, its name, its voice and who it hands
 * over to, left-aligned under each other, each with Edit to go back to its step – and Open dashboard to finish.
 * Right: the dashboard glides back up to its top and comes alive – the tabs get their names, the numbers land one
 * card after another, Draft turns Live and the loading sheen stops. The payoff of the whole flow.
 * Focus rings show for the keyboard only.
 * Uses OnboardingFrame, Preview, Steps and AgentMark from Onboarding / Website. Icons from the Hugeicons free set.
 */

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { AgentMark, Icon, OnboardingFrame, Preview, Steps, brandFrom, type ReplyLength, type Tone } from "@/components/ui/onboarding-website";

/* ---------- Types ---------- */

export type OnboardingReadyProps = {
  /** The domains from the first step – the first is the company's own */
  domains?: string[];
  /** The company's name from the second step */
  brand?: string;
  /** Short forms from the second step */
  aliases?: string[];
  /** The answers from the third step */
  name?: string;
  tone?: Tone;
  length?: ReplyLength;
  /** Who it hands over to – left out, it answers everything itself */
  handoverTo?: string;
  /** Open dashboard – the end of the flow */
  onFinish?: () => void;
  /** Edit on a row – goes back to that step (1 website, 2 name, 3 voice and handover) */
  onEdit?: (step: 1 | 2 | 3) => void;
  /** Called by Back in the top bar – hidden when left out */
  onBack?: () => void;
  onLogout?: () => void;
  /** The signed-in account, shown top right */
  email?: string;
  /** Your product's name – footer and logo label */
  product?: string;
  /** Your logo, top left – the affectUI mark when left out */
  logo?: ReactNode;
  /** Focus the first field (Ready: Open dashboard) when the step opens – on in a real flow */
  autoFocus?: boolean;
  /** The dashboard's layout: "inset" or "flat"; left out, it follows data-shell="flat" on an ancestor */
  layout?: "inset" | "flat";
  step?: number;
  steps?: number;
  className?: string;
};

const toneLabel: Record<Tone, string> = { friendly: "Friendly", neutral: "Neutral", formal: "Formal" };
const lengthLabel: Record<ReplyLength, string> = { short: "short replies", balanced: "balanced replies", detailed: "detailed replies" };

/* ---------- Screen ---------- */

export function OnboardingReadyScreen({
  domains = ["northwind.com"],
  brand: brandProp,
  aliases = ["Northwind Co."],
  name: nameProp,
  tone = "neutral",
  length = "balanced",
  handoverTo = "support@northwind.com",
  onFinish,
  onEdit,
  onBack,
  onLogout,
  email = "alex@northwind.com",
  product = "Lumen",
  logo,
  autoFocus,
  layout,
  step = 4,
  steps = 4,
  className,
}: OnboardingReadyProps) {
  const brand = brandProp ?? brandFrom(domains[0]);
  const name = nameProp?.trim() || `${brand} Assistant`;

  // The dashboard first glides up to its top, then comes alive
  const [live, setLive] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setLive(true), reduce ? 0 : 1300);
    return () => window.clearTimeout(t);
  }, []);

  // Long answers end in an ellipsis – their full text sits in the title
  const text = (t: string) => (
    <span className="ui-obr-text" title={t}>
      {t}
    </span>
  );
  const rows: { label: string; step: 1 | 2 | 3; value: ReactNode }[] = [
    {
      label: "Learns from",
      step: 1,
      value: domains.length ? (
        <span className="ui-obr-name" title={domains.join(", ")}>
          {text(domains[0])}
          {domains.length > 1 && <span className="ui-obr-more">+{domains.length - 1}</span>}
        </span>
      ) : (
        text("No sources yet")
      ),
    },
    {
      label: "Name",
      step: 3,
      value: (
        <span className="ui-obr-name">
          <AgentMark id={brand || "assistant"} />
          {text(name)}
        </span>
      ),
    },
    { label: "Voice", step: 3, value: text(`${toneLabel[tone]}, ${lengthLabel[length]}`) },
    { label: "Hands over to", step: 3, value: text(handoverTo || "Nobody – it answers itself") },
  ];

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
      preview={<Preview brand={brand} aliases={aliases} domains={domains} agentName={name} tone={tone} length={length} handoverTo={handoverTo || undefined} live={live} focus="top" />}
    >
      <style href="ui-screen-onboarding-ready" precedence="default">
        {css}
      </style>
      <Steps step={step} steps={steps} />
      <h1 className="ui-obw-title">Your assistant is ready</h1>
      <p className="ui-obw-sub">Here's what it knows. You can change all of it later.</p>

      <div className="ui-obw-form ui-obr">
        <dl className="ui-obr-list">
          {rows.map((r) => (
            <div key={r.label} className="ui-obr-row">
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
              {onEdit && (
                <button type="button" className="ui-obr-edit" onClick={() => onEdit(r.step)} aria-label={`Edit ${r.label.toLowerCase()}`}>
                  Edit
                </button>
              )}
            </div>
          ))}
        </dl>
        <button type="button" className="ui-obr-go" onClick={onFinish} data-autofocus>
          Open dashboard
          <Icon icon={ArrowRight02Icon} size={14} />
        </button>
      </div>
    </OnboardingFrame>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
/* The summary: no card, no lines – a label column and the answers, left-aligned, Edit at the end of each */
.ui-obr { display: grid; gap: 22px; text-align: left; }
.ui-obr-list { display: grid; gap: 4px; margin: 0; }
.ui-obr-row { display: grid; grid-template-columns: 112px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 36px; }
.ui-obr-row dt { color: var(--obw-faint); }
.ui-obr-row dd { display: flex; min-width: 0; margin: 0; color: var(--obw-ink); font-weight: 500; white-space: nowrap; }
.ui-obr-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ui-obr-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ui-obr-more { flex: none; height: 18px; padding: 0 6px; border-radius: 5px; background: var(--obw-line); color: var(--obw-muted); font-size: 11px; line-height: 18px; }
.ui-obr-edit { height: 26px; padding: 0 8px; border: 0; border-radius: 6px; background: none; color: var(--obw-faint); font-weight: 500; transition: background-color 160ms ease, color 160ms ease; }
.ui-obr-edit:hover { background: var(--obw-line); color: var(--obw-ink); }
.ui-obr-go {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border: 0; border-radius: 8px;
  background: var(--obw-dark); color: var(--obw-on-dark); font-weight: 500; transition: opacity 160ms ease, transform 160ms var(--obw-out);
}
.ui-obr-go:hover { opacity: 0.88; }
.ui-obr-go:active { transform: scale(0.98); }
@media (pointer: coarse) {
  .ui-obr-row { min-height: 44px; }
  .ui-obr-edit { height: 36px; padding: 0 10px; }
  .ui-obr-go { height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-obr * { transition: none !important; }
}
`;

