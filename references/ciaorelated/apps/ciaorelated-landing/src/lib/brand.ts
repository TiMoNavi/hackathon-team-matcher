const env = (import.meta as any).env ?? {};

function value(key: string, fallback = "") {
  const raw = env[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

function normalizeUrl(raw: string) {
  const trimmed = raw.replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function hostFromUrl(raw: string) {
  try {
    return new URL(normalizeUrl(raw)).host;
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }
}

export const brand = {
  appName: value("VITE_PUBLIC_APP_NAME", "ciaorelated"),
  wordmark: value("VITE_PUBLIC_WORDMARK", value("VITE_PUBLIC_APP_NAME", "ciaorelated")),
  tagline: value("VITE_PUBLIC_TAGLINE", "Social moments for real communities."),
  websiteUrl: normalizeUrl(value("VITE_PUBLIC_WEBSITE_URL", "https://ciaorelated.com")),
  supportEmail: value("VITE_PUBLIC_SUPPORT_EMAIL", "info@ciaorelated.com"),
  copyrightName: value("VITE_PUBLIC_COPYRIGHT_NAME", value("VITE_PUBLIC_APP_NAME", "ciaorelated")),
  legalEntity: value("VITE_PUBLIC_LEGAL_ENTITY", "ciaorelated"),
  legalAddress: value("VITE_PUBLIC_LEGAL_ADDRESS", ""),
  githubRepoUrl: normalizeUrl(value("VITE_PUBLIC_GITHUB_REPO_URL", "https://github.com/dogankaraarslan1/ciaorelated")),
  appScheme: value("VITE_PUBLIC_APP_SCHEME", "ciaorelated"),
  oneLinkUrl: normalizeUrl(value("VITE_PUBLIC_ONELINK_URL", "")),
  iosStoreUrl: normalizeUrl(value("VITE_PUBLIC_IOS_STORE_URL", value("VITE_PUBLIC_APP_STORE_URL", ""))),
  androidStoreUrl: normalizeUrl(value("VITE_PUBLIC_ANDROID_STORE_URL", value("VITE_PUBLIC_PLAY_STORE_URL", ""))),
};

export const brandHost = hostFromUrl(brand.websiteUrl);

export function brandTitle(suffix: string) {
  return `${suffix} — ${brand.appName}`;
}

export function brandText(text: string) {
  return text.replaceAll("ciaorelated", brand.appName);
}
