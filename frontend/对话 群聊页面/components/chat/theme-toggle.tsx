"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function ThemeToggle() {
  const mounted = useSyncExternalStore(subscribe, clientReady, serverReady);
  const { resolvedTheme, setTheme } = useTheme();
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "切换至日间模式" : "切换至夜间模式";

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      disabled={!mounted}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
      <span>{dark ? "夜间" : "日间"}</span>
    </button>
  );
}
