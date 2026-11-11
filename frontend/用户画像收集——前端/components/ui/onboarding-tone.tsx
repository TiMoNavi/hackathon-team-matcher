// components/ui/onboarding-tone.tsx
"use client";

/*
 * Onboarding / Tone – the third step of setting up an AI assistant, in the same frame as Onboarding / Website.
 * Left, centered in its half: the question, then a short form without a card – the fields left-aligned under each
 * other, each with its label on top: the assistant's name, its tone (Friendly, Neutral, Formal), how long its replies
 * are (Short, Balanced, Detailed), and whether it hands a conversation over to a person when it isn't sure – and to
 * which address. Continue spans the column at the end.
 * Right, running off the edge: the same dashboard, glided down to its Test chat – a customer asks about changing
 * plans, the assistant answers under its name, in the chosen tone and length, and the line under it says who it hands
 * over to. While it "writes" a new answer its mark twinkles. Its card further up follows the name and tone too.
 * Keyboard: tone and length are radio groups – arrow keys move them; the handover is a switch; Enter continues.
 * Focus rings show for the keyboard only; text fields only firm their edge.
 * Uses OnboardingFrame, Preview and Steps from Onboarding / Website. Icons from the Hugeicons free set.
 */

import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { Icon, OnboardingFrame, Preview, Steps, brandFrom, type ReplyLength, type Tone } from "@/components/ui/onboarding-website";

/* ---------- Types ---------- */

export type OnboardingToneValues = { name: string; tone: Tone; length: ReplyLength; handover: boolean; email: string };

export type OnboardingToneProps = {
  /** The website from the first step – the Knowledge table and the suggested handover address */
  domain?: string;
  /** The name from the step before – the assistant's card and its suggested name */
  brand?: string;
  /** Short forms from the step before – tags on the assistant's card */
  aliases?: string[];
  /** The assistant's name – "<brand> Assistant" when left out */
  defaultName?: string;
  defaultTone?: Tone;
  defaultLength?: ReplyLength;
  /** Hand over to a person when unsure – on by default */
  defaultHandover?: boolean;
  /** Where it hands over to – support@ your domain when left out */
  defaultEmail?: string;
  /** Called with all answers when Continue is pressed */
  onContinue?: (values: OnboardingToneValues) => void;
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
  /** Where this step sits in the flow: dashes over the question */
  step?: number;
  steps?: number;
  className?: string;
};

const tones: { id: Tone; label: string }[] = [
  { id: "friendly", label: "Friendly" },
  { id: "neutral", label: "Neutral" },
  { id: "formal", label: "Formal" },
];
const lengths: { id: ReplyLength; label: string }[] = [
  { id: "short", label: "Short" },
  { id: "balanced", label: "Balanced" },
  { id: "detailed", label: "Detailed" },
];
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/* ---------- Screen ---------- */

export function OnboardingToneScreen({
  domain = "northwind.com",
  brand: brandProp,
  aliases = ["Northwind Co."],
  defaultName,
  defaultTone = "neutral",
  defaultLength = "balanced",
  defaultHandover = true,
  defaultEmail,
  onContinue,
  onBack,
  onLogout,
  email: account = "alex@northwind.com",
  product = "Lumen",
  logo,
  autoFocus,
  layout,
  step = 3,
  steps = 4,
  className,
}: OnboardingToneProps) {
  const brand = brandProp ?? brandFrom(domain);
  const [name, setName] = useState(defaultName ?? `${brand} Assistant`);
  const [tone, setTone] = useState<Tone>(defaultTone);
  const [length, setLength] = useState<ReplyLength>(defaultLength);
  const [handover, setHandover] = useState(defaultHandover);
  const [address, setAddress] = useState(defaultEmail ?? `support@${domain}`);
  const valid = !!name.trim() && (!handover || isEmail(address));
  const id = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onContinue?.({ name: name.trim(), tone, length, handover, email: address.trim() });
  };

  return (
    <OnboardingFrame
      className={className}
      email={account}
      product={product}
      logo={logo}
      autoFocus={autoFocus}
      layout={layout}
      onBack={onBack}
      onLogout={onLogout}
      preview={
        <Preview
          brand={brand}
          aliases={aliases}
          domains={[domain]}
          agentName={name}
          tone={tone}
          length={length}
          handoverTo={handover && isEmail(address) ? address.trim() : undefined}
          focus="chat"
        />
      }
    >
      <style href="ui-screen-onboarding-tone" precedence="default">
        {css}
      </style>
      <Steps step={step} steps={steps} />
      <h1 className="ui-obw-title">How should your assistant sound?</h1>
      <p className="ui-obw-sub">Give it a name, a voice and someone to ask.</p>

      <form className="ui-obw-form ui-obt" onSubmit={submit} noValidate>
        <div className="ui-obt-field">
          <label className="ui-obt-label" htmlFor={`${id}-name`}>
            Name
          </label>
          <span className="ui-obt-input">
            <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} spellCheck={false} autoComplete="off" />
          </span>
        </div>

        <div className="ui-obt-field">
          <span className="ui-obt-label" id={`${id}-tone`}>
            Tone
          </span>
          <Segmented options={tones} value={tone} onChange={setTone} labelledBy={`${id}-tone`} />
        </div>

        <div className="ui-obt-field">
          <span className="ui-obt-label" id={`${id}-length`}>
            Reply length
          </span>
          <Segmented options={lengths} value={length} onChange={setLength} labelledBy={`${id}-length`} />
        </div>

        <div className="ui-obt-field">
          <div className="ui-obt-switch-row">
            <span className="ui-obt-label" id={`${id}-hand`}>
              Hand over to a person
              <span className="ui-obt-note">When it can't answer for sure</span>
            </span>
            <Switch on={handover} onChange={setHandover} labelledBy={`${id}-hand`} />
          </div>
          <span className="ui-obt-input" data-off={!handover || undefined}>
            <input
              type="email"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={!handover}
              aria-label="Hand over to"
              aria-invalid={(handover && !!address && !isEmail(address)) || undefined}
              autoComplete="email"
              spellCheck={false}
            />
          </span>
        </div>

        <button type="submit" className="ui-obt-go" disabled={!valid}>
          Continue
          <Icon icon={ArrowRight02Icon} size={14} />
        </button>
      </form>
    </OnboardingFrame>
  );
}

/* ---------- Parts ---------- */

/** Options in a gray track, the chosen one white – a radio group: arrow keys move it */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labelledBy,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  labelledBy: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = (options.findIndex((o) => o.id === value) + dir + options.length) % options.length;
    onChange(options[i].id);
    (e.currentTarget.children[i] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className="ui-obt-seg" role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKey}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} tabIndex={value === o.id ? 0 : -1} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, labelledBy }: { on: boolean; onChange: (on: boolean) => void; labelledBy: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-labelledby={labelledBy} className="ui-obt-switch" onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
/* The form: no card – fields left-aligned under each other, the label on top, Continue across the column */
.ui-obt { display: grid; gap: 18px; text-align: left; }
.ui-obt-field { display: grid; gap: 8px; }
.ui-obt-label { display: grid; font-weight: 500; color: var(--obw-ink); }
.ui-obt-note { font-size: 12px; font-weight: 400; line-height: 16px; color: var(--obw-faint); }

.ui-obt-input { display: flex; height: 36px; padding: 0 12px; border-radius: 8px; background: var(--obw-card); box-shadow: var(--obw-shadow); transition: box-shadow 160ms ease, opacity 200ms ease; }
.ui-obt-input:focus-within { box-shadow: var(--obw-shadow-firm); }
.ui-obt-input[data-off] { opacity: 0.45; }
.ui-obt-input input { flex: 1; min-width: 0; padding: 0; border: 0; outline: 0; background: none; font: inherit; color: var(--obw-ink); }
.ui-obt-input input:focus-visible { outline: none; outline-offset: 0; }
.ui-obt-input input[aria-invalid] { color: var(--obw-red); }

.ui-obt-seg { display: grid; grid-auto-columns: minmax(0, 1fr); grid-auto-flow: column; gap: 2px; padding: 2px; border-radius: 8px; background: var(--obw-line); }
.ui-obt-seg button { height: 30px; padding: 0 10px; border: 0; border-radius: 6px; background: none; color: var(--obw-muted); font-weight: 500; transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease; }
.ui-obt-seg button:hover { color: var(--obw-ink); }
.ui-obt-seg button[aria-checked="true"] { background: var(--obw-card); color: var(--obw-ink); box-shadow: var(--obw-shadow); }
.ui-obt-seg button:focus-visible { outline-offset: -2px; }

.ui-obt-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.ui-obt-switch { position: relative; flex: none; width: 32px; height: 20px; padding: 0; border: 0; border-radius: 10px; background: var(--obw-line); transition: background-color 200ms ease; }
.ui-obt-switch i { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); transition: transform 240ms var(--obw-out); }
.ui-obt-switch[aria-checked="true"] { background: var(--obw-dark); }
.ui-obt-switch[aria-checked="true"] i { transform: translateX(12px); }
:where(.dark, [data-theme="dark"]) .ui-obt-switch[aria-checked="true"] i { background: #111; }

.ui-obt-go {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; margin-top: 4px; padding: 0 14px; border: 0; border-radius: 8px;
  background: var(--obw-dark); color: var(--obw-on-dark); font-weight: 500; transition: opacity 160ms ease, transform 160ms var(--obw-out);
}
.ui-obt-go:hover:not(:disabled) { opacity: 0.88; }
.ui-obt-go:active:not(:disabled) { transform: scale(0.98); }
.ui-obt-go:disabled { opacity: 0.45; }
@media (pointer: coarse) {
  .ui-obt-input { height: 44px; }
  .ui-obt-seg button { height: 36px; }
  .ui-obt-go { height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-obt * { transition: none !important; }
}
`;

