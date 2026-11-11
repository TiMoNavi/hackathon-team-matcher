import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// ✅ JSON resources
import de from "./locales/de.json";
import en from "./locales/en.json";

export type AppLanguage = "de" | "en";
export type AppLanguageMode = AppLanguage | "auto";

const STORAGE_KEY = "app-language-mode"; // "auto" | "de" | "en"

// Falls du später mehr Sprachen willst:
const SUPPORTED_LANGS: AppLanguage[] = ["de", "en"];
const FALLBACK_LANG: AppLanguage = "en";

function resolveDeviceLanguage(): AppLanguage {
  // Expo Localization liefert z.B. [{ languageCode: "de", regionCode: "AT", ... }]
  const locale = Localization.getLocales?.()?.[0];

  const languageCode = (locale?.languageCode || "").toLowerCase();
  const regionCode = (locale?.regionCode || "").toUpperCase();

  // Heuristik: Deutsch wenn Sprache = de oder Region AT/DE/CH
  if (languageCode === "de") return "de";
  if (["AT", "DE", "CH"].includes(regionCode)) return "de";

  // Wenn device Sprache z.B. "en" ist:
  if (SUPPORTED_LANGS.includes(languageCode as AppLanguage)) {
    return languageCode as AppLanguage;
  }

  return FALLBACK_LANG;
}

async function getStoredLanguageMode(): Promise<AppLanguageMode | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    if (raw === "auto") return "auto";
    if (SUPPORTED_LANGS.includes(raw as AppLanguage)) return raw as AppLanguage;

    return null;
  } catch {
    return null;
  }
}

async function detectInitialLanguage(): Promise<{ mode: AppLanguageMode; lang: AppLanguage }> {
  const stored = await getStoredLanguageMode();

  // Wenn nichts gesetzt: auto + device
  if (!stored) {
    const lang = resolveDeviceLanguage();
    return { mode: "auto", lang };
  }

  // Wenn user auto gesetzt hat: device
  if (stored === "auto") {
    const lang = resolveDeviceLanguage();
    return { mode: "auto", lang };
  }

  // Wenn user fix gesetzt hat: genau das
  return { mode: stored, lang: stored };
}

/**
 * Optional: diese Helfer exportieren, damit SettingsScreen / Language Screen
 * die Sprache sauber setzen können.
 */
export async function setLanguageMode(mode: AppLanguageMode) {
  await AsyncStorage.setItem(STORAGE_KEY, mode);
  const lang = mode === "auto" ? resolveDeviceLanguage() : mode;
  await i18n.changeLanguage(lang);
}

export async function getLanguageMode(): Promise<AppLanguageMode> {
  const stored = await getStoredLanguageMode();
  return stored ?? "auto";
}

export function getResolvedLanguageNow(): AppLanguage {
  // i18n.language kann "de-AT" sein; normalisieren:
  const lng = (i18n.language || "").toLowerCase();
  if (lng.startsWith("de")) return "de";
  if (lng.startsWith("en")) return "en";
  return FALLBACK_LANG;
}

export default i18n;

// ✅ i18n initialisieren (einmal importieren)
(async () => {
  const { lang } = await detectInitialLanguage();

  await i18n
    .use(initReactI18next)
    .init({
      resources: {
        de: { translation: de as any },
        en: { translation: en as any },
      },
      lng: lang, // initial detected
      fallbackLng: FALLBACK_LANG,
      interpolation: {
        escapeValue: false, // React macht escaping
      },
      // Optional, aber oft praktisch:
      returnNull: false,
    });
})();
