import Constants from "expo-constants";

type LegalLanguage = "de" | "en";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

const extraKeyByEnv: Record<string, string> = {
  EXPO_PUBLIC_API_URL: "apiUrl",
  EXPO_PUBLIC_WEBSITE_URL: "websiteUrl",
  EXPO_PUBLIC_ONELINK_URL: "oneLinkUrl",
  EXPO_PUBLIC_APP_SCHEME: "appScheme",
};

function envValue(key: string) {
  const fromProcess = process.env[key];
  const fromExtra = extra[extraKeyByEnv[key] ?? key];
  const raw = fromProcess ?? (typeof fromExtra === "string" ? fromExtra : "");
  return String(raw || "").trim();
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeBaseUrl(value: string) {
  const trimmed = trimTrailingSlash(value.trim());
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function joinUrl(base: string, path: string) {
  const cleanBase = trimTrailingSlash(base);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

export const appScheme = envValue("EXPO_PUBLIC_APP_SCHEME") || "ciaorelated";
export const websiteBaseUrl = normalizeBaseUrl(envValue("EXPO_PUBLIC_WEBSITE_URL")) || "https://example.com";
export const oneLinkBaseUrl = normalizeBaseUrl(envValue("EXPO_PUBLIC_ONELINK_URL"));

export const linkingPrefixes = [
  `${appScheme}://`,
  websiteBaseUrl,
  oneLinkBaseUrl,
].filter(Boolean);

export function buildWebUrl(path: string) {
  return joinUrl(websiteBaseUrl, path);
}

export function buildJoinUrl(slug: string) {
  return buildWebUrl(`/join?slug=${encodeURIComponent(slug)}`);
}

export function buildLegalUrls(lang: LegalLanguage) {
  if (lang === "de") {
    return {
      terms: buildWebUrl("/terms-de.html"),
      guidelines: buildWebUrl("/guidelines-de.html"),
      privacy: buildWebUrl("/datenschutz.html"),
    };
  }

  return {
    terms: buildWebUrl("/terms.html"),
    guidelines: buildWebUrl("/guidelines.html"),
    privacy: buildWebUrl("/privacy.html"),
  };
}

export function isTrustedWebUrl(url: string) {
  return linkingPrefixes.some((prefix) => url.startsWith(prefix));
}
