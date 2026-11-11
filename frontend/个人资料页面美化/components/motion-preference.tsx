"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { MotionConfig } from "motion/react";
const MotionPreference = createContext({ paused: false, reduced: false, toggle: () => {} });
function subscribeReducedMotion(listener: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const getReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const getServerReducedMotion = () => false;

export function MotionPreferenceProvider({ children }: { children: React.ReactNode }) {
  const [manualPause, setManualPause] = useState(false);
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getServerReducedMotion);
  const paused = manualPause || !!reduced;
  useEffect(() => { document.documentElement.dataset.motion = paused ? "paused" : "running"; }, [paused]);
  return <MotionPreference.Provider value={{ paused, reduced: !!reduced, toggle: () => setManualPause(!manualPause) }}><MotionConfig reducedMotion={paused ? "always" : "never"}>{children}</MotionConfig></MotionPreference.Provider>;
}
export const useMotionPreference = () => useContext(MotionPreference);

/** Keeps hidden presentation scenes quiet without changing the global switch. */
export function SceneMotion({ active, children }: { active: boolean; children: React.ReactNode }) {
  const preference = useMotionPreference();
  return <MotionPreference.Provider value={{ ...preference, paused: preference.paused || !active }}>{children}</MotionPreference.Provider>;
}
