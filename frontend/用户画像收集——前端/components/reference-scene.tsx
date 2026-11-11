"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
const ExpandedReferenceScene = dynamic(() => import("./expanded-reference-scenes"));
const SurfaceReferenceScene = dynamic(() => import("./surface-reference-scenes"));
const surfaceSlugs = new Set(["kit-beams", "kit-radar", "kit-particles", "kit-selection", "kit-cards-hover", "logo-cluster", "integration-grid", "outreach-branches", "model-wheel", "side-folder", "empty-calendar", "project-card", "notification-stack", "smart-recommendation", "tips-panel", "shimmer-loader", "number-ticker", "testimonial-wall", "logo-marquee", "background-composer", "border-composer", "card-reveal-scene"]);
const expandedSlugs = new Set(["glow-cloud","glass-folder","integration-beam","integration-flow","agent-team","project-flow","layer-stack","cover-flow","team-invite","blur-crossfade","tilt-card","gradient-text","text-reveal","grid-background","decision-card","agent-trail","writing-assistant","prompt-library","tag-input","dropzone"]);
import { OnboardingWebsiteScreen } from "@/components/ui/onboarding-website";
import { OnboardingBrandScreen } from "@/components/ui/onboarding-brand";
import { OnboardingToneScreen, type OnboardingToneValues } from "@/components/ui/onboarding-tone";
import { OnboardingReadyScreen } from "@/components/ui/onboarding-ready";
import { FrostCloud } from "./reference-originals/frost-cloud";
import { GlowKeyboard } from "./reference-originals/glow-keyboard";
import { EnrichmentOrbit } from "./reference-originals/enrichment-orbit";
import { AgentGallery } from "./reference-originals/agent-gallery";
import { GradientFloor } from "./reference-originals/gradient-floor";

export default function ReferenceScene({ slug }: { slug: string }) {
  const [step, setStep] = useState(1);
  const [isDark, setIsDark] = useState(false);
  const [domains, setDomains] = useState(["northwind.com"]);
  const [names, setNames] = useState<string[]>([]);
  const [settings, setSettings] = useState<OnboardingToneValues | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const dark = new URLSearchParams(location.search).get("theme") === "dark";
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    // The old sample's manual animation preference belongs to that sample.
    // Each original component still respects the system reduced-motion setting.
    delete document.documentElement.dataset.motion;
  }, []);
  const common = { email: "alex@northwind.com", onLogout: () => setMessage("这是原版退出入口的演示，没有登录会话。") };
  const brand = names[0] || domains[0].split(".")[0].replace(/^./, letter => letter.toUpperCase());
  return <>
    <style>{"html,body{height:100%;min-height:100%}body{margin:0}.reference-scene{min-height:100svh;display:grid;place-items:center;padding:28px 20px;box-sizing:border-box}.reference-art{width:100%;max-width:760px}.reference-cloud{max-width:440px}.reference-gallery{max-width:1180px}.reference-floor{min-height:580px;width:100%;display:grid;place-items:center;text-align:center}.reference-floor h1{font-family:var(--display-font);font-size:clamp(32px,5vw,60px);font-weight:600;line-height:1.1;margin-bottom:16px}.reference-floor p{font-size:15px;color:var(--muted-foreground)}.reference-scene-message{position:fixed;bottom:20px;left:20px;right:20px;margin:auto;max-width:580px;z-index:100;padding:16px 20px;background:var(--card);color:var(--foreground);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 30px #0001;font-size:13px}.reference-scene-message button{margin-left:16px;cursor:pointer;color:var(--primary);border:0;background:transparent;padding:8px}@media(max-width:600px){.reference-scene{padding:12px}.reference-floor{min-height:650px}}"}</style>
    {slug === "onboarding" ? <>
      {step === 1 && <OnboardingWebsiteScreen {...common} defaultDomains={domains} onContinue={values => { setDomains(values); setStep(2); setMessage(""); }}/>}
      {step === 2 && <OnboardingBrandScreen {...common} domain={domains[0]} defaultNames={names.length ? names : undefined} onBack={() => setStep(1)} onContinue={values => { setNames(values); setStep(3); }}/>}
      {step === 3 && <OnboardingToneScreen {...common} domain={domains[0]} brand={brand} aliases={names.slice(1)} defaultName={settings?.name} defaultTone={settings?.tone} defaultLength={settings?.length} defaultHandover={settings?.handover} defaultEmail={settings?.email} onBack={() => setStep(2)} onContinue={values => { setSettings(values); setStep(4); }}/>}
      {step === 4 && <OnboardingReadyScreen {...common} domains={domains} brand={brand} aliases={names.slice(1)} name={settings?.name} tone={settings?.tone} length={settings?.length} handoverTo={settings?.handover ? settings.email : ""} onBack={() => setStep(3)} onEdit={setStep} onFinish={() => setMessage("已到达原版流程终点。此处仅演示，不会发布 AI 助手或提交资料。")}/>}
    </> : <div className="reference-scene">
      {expandedSlugs.has(slug) && <ExpandedReferenceScene slug={slug} dark={isDark}/>}
      {surfaceSlugs.has(slug) && <SurfaceReferenceScene slug={slug}/>}
      {slug === "frost-cloud" && <FrostCloud className="reference-art reference-cloud"/>}
      {slug === "glow-keyboard" && <GlowKeyboard className="reference-art"/>}
      {slug === "enrichment-orbit" && <EnrichmentOrbit className="reference-art"/>}
      {slug === "agent-gallery" && <AgentGallery className="reference-art reference-gallery"/>}
      {slug === "gradient-floor" && <GradientFloor className="reference-floor"><div><h1>Ideas start to glow.</h1><p>Gradient Floor · AffectUI 原版背景动效</p></div></GradientFloor>}
    </div>}
    {message && <div role="status" className="reference-scene-message">{message}<button onClick={() => setMessage("")}>关闭</button></div>}
  </>;
}

