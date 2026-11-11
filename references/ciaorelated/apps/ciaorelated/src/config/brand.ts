import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

function readString(envKey: string, extraKey: string, fallback: string) {
  const fromProcess = process.env[envKey];
  const fromExtra = extra[extraKey];
  const value = fromProcess ?? (typeof fromExtra === "string" ? fromExtra : "");
  return String(value || "").trim() || fallback;
}

export const brand = {
  appName: readString("EXPO_PUBLIC_APP_NAME", "appName", "ciaorelated"),
  appSlug: readString("EXPO_PUBLIC_APP_SLUG", "appSlug", "ciaorelated"),
  feedHeaderText: readString("EXPO_PUBLIC_FEED_HEADER_TEXT", "feedHeaderText", "ciao"),
  qrCenterText: readString("EXPO_PUBLIC_QR_CENTER_TEXT", "qrCenterText", "ciaorelated"),
  supportEmail: readString("EXPO_PUBLIC_SUPPORT_EMAIL", "supportEmail", "support@example.com"),
};
