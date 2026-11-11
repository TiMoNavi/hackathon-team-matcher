"use client";

import { Code2, FileText, Globe, Sparkles } from "lucide-react";
import { AiCompanion } from "@/components/ai-companion";
import { useMotionPreference } from "@/components/motion-preference";

// Orbit/counter-rotation composition adapted from Shadcn UI Kit hero7 and
// Signalry IntegrationOrbit. The center is AffectUI's interactive FrostCloud.
// Source-selection controls stay outside this moving illustration.
export function ProfileOrbit({ activeSource }: { activeSource: string }) {
  const { paused } = useMotionPreference();
  return (
    <div className="profile-orbit" data-paused={paused ? "true" : "false"}>
      <div className="profile-orbit__wash profile-orbit__wash--one" aria-hidden />
      <div className="profile-orbit__wash profile-orbit__wash--two" aria-hidden />
      <div className="profile-orbit__stage">
        <div className="profile-orbit__halo" aria-hidden />
        <div className="profile-orbit__ring profile-orbit__ring--inner" aria-hidden>
          <span className="profile-orbit__satellite profile-orbit__satellite--top"><span className="profile-orbit__counter"><Sparkles /></span></span>
          <span className="profile-orbit__light" />
        </div>
        <div className="profile-orbit__ring profile-orbit__ring--outer" aria-hidden>
          <span className="profile-orbit__satellite profile-orbit__satellite--top"><span className="profile-orbit__counter" data-active={activeSource === "github"}><Code2 /></span></span>
          <span className="profile-orbit__satellite profile-orbit__satellite--right"><span className="profile-orbit__counter" data-active={activeSource === "portfolio"}><Globe /></span></span>
          <span className="profile-orbit__satellite profile-orbit__satellite--left"><span className="profile-orbit__counter" data-active={activeSource === "resume"}><FileText /></span></span>
        </div>
        <div className="profile-orbit__companion"><AiCompanion className="h-auto w-full" /></div>
        <span className="profile-orbit__thought">原来你还会这个！<Sparkles className="size-3.5 text-primary" aria-hidden /></span>
      </div>
      <style>{`
        /* The rounded scene clips the whole illustration; clipping this inner
           box would cut its blurred light into a visible horizontal strip. */
        .profile-orbit { position: relative; width: 100%; min-height: 390px; isolation: isolate; overflow: visible; }
        .profile-orbit__stage { position: absolute; left: 50%; top: 50%; width: 500px; height: 500px; transform: translate(-50%,-50%) scale(.72); }
        .profile-orbit__wash { position: absolute; pointer-events: none; z-index: -1; width: 63%; aspect-ratio: 1; border-radius: 50%; filter: blur(44px); opacity: .72; }
        .profile-orbit__wash--one { left: 8%; top: 8%; background: color-mix(in srgb,var(--primary) 15%,transparent); animation: profile-orbit-wash 13s ease-in-out infinite alternate; }
        .profile-orbit__wash--two { right: 6%; bottom: 5%; background: color-mix(in srgb,var(--lime) 27%,transparent); animation: profile-orbit-wash 16s ease-in-out -7s infinite alternate-reverse; }
        .profile-orbit__halo { position: absolute; inset: 66px; border-radius: 50%; background: radial-gradient(circle at 42% 36%,var(--card),color-mix(in srgb,var(--secondary) 65%,transparent) 65%,transparent 72%); box-shadow: 0 0 90px color-mix(in srgb,var(--primary) 8%,transparent); }
        .profile-orbit__ring { position: absolute; inset: 50%; border-radius: 50%; box-shadow: inset 0 0 0 1px color-mix(in srgb,var(--primary) 10%,transparent); pointer-events: none; animation: profile-orbit-spin var(--orbit-duration) linear infinite; }
        .profile-orbit__ring::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; background: conic-gradient(from 20deg,transparent 45%,color-mix(in srgb,var(--primary) 48%,transparent),transparent 80%); mask: linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); mask-composite: exclude; }
        .profile-orbit__ring--inner { --orbit-duration: 32s; width: 270px; height: 270px; margin: -135px; }
        .profile-orbit__ring--outer { --orbit-duration: 48s; width: 420px; height: 420px; margin: -210px; animation-direction: reverse; }
        .profile-orbit__satellite { position: absolute; display: grid; width: 56px; height: 56px; place-items: center; }
        .profile-orbit__satellite--top { top: 0; left: 50%; translate: -50% -50%; }
        .profile-orbit__satellite--left { top: 75%; left: 6.7%; translate: -50% -50%; }
        .profile-orbit__satellite--right { top: 75%; left: 93.3%; translate: -50% -50%; }
        .profile-orbit__counter { display: grid; width: 100%; height: 100%; place-items: center; border-radius: 18px; background: color-mix(in srgb,var(--card) 92%,transparent); color: var(--primary); backdrop-filter: blur(16px); box-shadow: 0 10px 30px -12px color-mix(in srgb,var(--primary) 38%,transparent),inset 0 1px 0 var(--card); animation: profile-orbit-spin var(--orbit-duration) linear infinite reverse; transition: color .3s,background .3s; }
        .profile-orbit__counter svg { width: 23px; height: 23px; }
        .profile-orbit__counter[data-active=true] { background: var(--primary); color: var(--primary-foreground); }
        .profile-orbit__ring--outer .profile-orbit__counter { animation-direction: normal; }
        .profile-orbit__ring--inner .profile-orbit__satellite { width: 38px; height: 38px; }
        .profile-orbit__ring--inner .profile-orbit__counter { border-radius: 12px; background: var(--lime); color: var(--night); }
        .profile-orbit__ring--inner .profile-orbit__counter svg { width: 17px; height: 17px; }
        .profile-orbit__light { position: absolute; left: 50%; bottom: -3px; width: 7px; height: 7px; border-radius: 50%; background: var(--primary); box-shadow: 0 0 16px var(--primary); }
        .profile-orbit__companion { position: absolute; left: 50%; top: 49%; width: 310px; transform: translate(-50%,-50%); }
        .profile-orbit__thought { position: absolute; left: 49%; top: 75%; display: flex; align-items: center; gap: 7px; white-space: nowrap; padding: 12px 16px; border-radius: 16px 16px 16px 3px; background: color-mix(in srgb,var(--card) 88%,transparent); backdrop-filter: blur(16px); font-size: 13px; color: var(--body); box-shadow: 0 12px 32px -15px color-mix(in srgb,var(--primary) 26%,transparent); animation: profile-orbit-thought 5s ease-in-out infinite; }
        @keyframes profile-orbit-spin { to { transform: rotate(360deg); } }
        @keyframes profile-orbit-wash { to { transform: translate(20%,-9%) scale(1.2); } }
        @keyframes profile-orbit-thought { 50% { transform: translateY(-6px); } }
        .profile-orbit[data-paused=true] .profile-orbit__wash, .profile-orbit[data-paused=true] .profile-orbit__ring, .profile-orbit[data-paused=true] .profile-orbit__counter, .profile-orbit[data-paused=true] .profile-orbit__thought { animation-play-state: paused; }
        @media (min-width: 640px) { .profile-orbit { min-height: 450px; } .profile-orbit__stage { transform: translate(-50%,-50%) scale(.9); } }
        @media (min-width: 1024px) { .profile-orbit { min-height: 455px; } .profile-orbit__stage { transform: translate(-50%,-50%) scale(.95); } }
        @media (max-width: 360px) { .profile-orbit { min-height: 330px; } .profile-orbit__stage { transform: translate(-50%,-50%) scale(.59); } }
        @media (prefers-reduced-motion: reduce) { .profile-orbit__wash,.profile-orbit__ring,.profile-orbit__counter,.profile-orbit__thought { animation: none; } }
      `}</style>
    </div>
  );
}
