import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkTheme, lightTheme, Theme } from "./theme";

type ThemeContextType = {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = "app-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(darkTheme);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "light") setTheme(lightTheme);
      else setTheme(darkTheme); // default
    });
  }, []);

  const toggleTheme = async () => {
    const next = theme.mode === "dark" ? lightTheme : darkTheme;
    setTheme(next);
    await AsyncStorage.setItem(STORAGE_KEY, next.mode);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme.mode === "dark",
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
