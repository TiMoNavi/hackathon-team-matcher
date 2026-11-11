// components/ui/onboarding-brand.tsx
"use client";

/*
 * Onboarding / Brand – the second step of the sign-up flow for an AI assistant, in the same frame as
 * Onboarding / Website. Left, centered in its half: what the company is called, one field with Add (+) and
 * Continue (→), and the names added so far as chips centered under it – the first one is the name the assistant
 * introduces itself with, the others short forms customers use ("Northwind Co.", "NW"). When one is added or removed
 * the others glide over.
 * Right, running off the edge: the same dashboard, glided up to the assistant's card – its name and greeting fill in
 * as you type, the short forms land as tags. It starts from the website of the step before: northwind.com suggests
 * "Northwind".
 * Enter or a comma adds a name (Enter continues when the field is empty), Backspace in an empty field takes the last
 * chip back, every chip has its own remove button. Names keep their spaces and capitals; the same name twice, in any
 * case, is added once.
 * Uses OnboardingFrame, ChipField, Preview and Steps from Onboarding / Website. Icons from the Hugeicons free set.
 */

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Add01Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { ChipField, Icon, OnboardingFrame, Preview, Steps, brandFrom } from "@/components/ui/onboarding-website";

/* ---------- Types ---------- */

export type OnboardingBrandProps = {
  /** The website from the step before – suggests the first name when defaultNames is left out */
  domain?: string;
  /** Names already known; the first one is the brand's own */
  defaultNames?: string[];
  /** Types this into the field once on load (for demos and recordings); stops as soon as someone types */
  autoType?: string;
  /** Called with the names – the brand's own first – when Continue is pressed */
  onContinue?: (names: string[]) => void;
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

/** Trims and folds inner spaces – "  Northwind   Co. " → "Northwind Co." */
const cleanName = (raw: string) => raw.trim().replace(/\s+/g, " ").slice(0, 60);
const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

/* ---------- Screen ---------- */

export function OnboardingBrandScreen({
  domain = "northwind.com",
  defaultNames,
  autoType,
  onContinue,
  onBack,
  onLogout,
  email = "alex@northwind.com",
  product = "Lumen",
  logo,
  autoFocus,
  layout,
  step = 2,
  steps = 4,
  className,
}: OnboardingBrandProps) {
  const [names, setNames] = useState<string[]>(() => (defaultNames ?? [brandFrom(domain)]).map(cleanName).filter(Boolean));
  const [value, setValue] = useState("");
  const typed = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();

  // Demo typing – one character at a time, then added as a chip; any real keystroke ends it
  useEffect(() => {
    if (!autoType) return;
    const add = () => setNames((n) => (n.some((x) => same(x, autoType)) ? n : [...n, cleanName(autoType)]));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      add();
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
          add();
          setValue("");
        }, 700);
    }, 1100);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoType]);

  const pending = cleanName(value);
  // The dashboard shows the brand's own name – or what you're typing, before there is one
  const brand = names[0] ?? pending;

  const withPending = () => (pending && !names.some((n) => same(n, pending)) ? [...names, pending] : names);
  const add = () => {
    if (!pending) return;
    setNames(withPending());
    setValue("");
  };
  const remove = (name: string) => {
    setNames((all) => all.filter((x) => x !== name));
    input.current?.focus();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const all = withPending();
    setNames(all);
    setValue("");
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
    if (e.key === "Backspace" && !value && names.length) setNames((n) => n.slice(0, -1));
    if (e.key === "," && value) {
      e.preventDefault();
      add();
    }
  };

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
      // Only names that were added land as tags – a half-typed one would remount its tag on every keystroke
      preview={<Preview brand={brand} aliases={names.slice(1)} domains={[domain]} focus="agent" />}
    >
      <Steps step={step} steps={steps} />
      <h1 className="ui-obw-title">What's your company called?</h1>
      <p className="ui-obw-sub">Your assistant introduces itself with it. Add short forms, too.</p>

      <form className="ui-obw-form" onSubmit={submit} noValidate>
        <ChipField
          chips={names}
          onRemove={remove}
          brand={brand}
          mark={false}
          label="Company names"
          hint={
            <p id={hintId} className="ui-obw-hint" aria-live="polite">
              {names.length > 1 ? "The first name is the one your assistant uses" : " "}
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
            }}
            onKeyDown={onKey}
            placeholder={names.length ? "Add a short form" : brandFrom(domain) || "Company name"}
            aria-label="Company name"
            aria-describedby={hintId}
            autoComplete="organization"
            spellCheck={false}
          />
          <button type="button" className="ui-obw-btn" aria-label="Add name" title="Add name" onClick={add} disabled={!pending}>
            <Icon icon={Add01Icon} size={14} />
          </button>
          <button type="submit" className="ui-obw-btn ui-obw-btn--go" aria-label="Continue" title="Continue" disabled={!names.length && !pending}>
            <Icon icon={ArrowRight02Icon} size={14} />
          </button>
        </ChipField>
      </form>
    </OnboardingFrame>
  );
}

