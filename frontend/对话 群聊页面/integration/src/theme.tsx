import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

export const themeStorageKey = "team-matcher-chat-theme";
type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

// External bundled code applies classes. No inline theme scripts or styles.
export function ChatThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    try { setTheme(localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light"); } catch { /* Storage can be unavailable. */ }
    const sync = (event: StorageEvent) => {
      if (event.key === themeStorageKey) setTheme(event.newValue === "dark" ? "dark" : "light");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem(themeStorageKey, next); } catch { /* Continue in memory. */ }
  }
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function ChatThemeToggle() {
  const { theme, toggle } = useContext(ThemeContext);
  const dark = theme === "dark";
  const label = dark ? "切换至日间模式" : "切换至夜间模式";
  return <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={toggle}>
    {dark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
    <span>{dark ? "夜间" : "日间"}</span>
  </button>;
}
