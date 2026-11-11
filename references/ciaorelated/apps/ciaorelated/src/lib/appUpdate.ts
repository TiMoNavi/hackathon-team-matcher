// apps/ciaorelated/src/lib/appUpdate.ts
import { Alert, Platform, Linking } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import { gql, type ApolloClient } from "@apollo/client";
import i18n from "../i18n";

type UpdateOptions = {
  force?: boolean;
};

export type AppUpdateInfo = {
  currentVersion: string;
  storeVersion: string;
  storeUrl: string;
};

const LAST_PROMPTED_KEY = "app_update:last_prompted_store_version";

const APP_RUNTIME_CONFIG = gql`
  query AppRuntimeConfig($platform: AppPlatform!, $appSlug: String, $currentVersion: String) {
    appRuntimeConfig(platform: $platform, appSlug: $appSlug, currentVersion: $currentVersion) {
      platform
      minSupportedVersion
      latestVersion
      storeUrl
    }
  }
`;

/* ---------- Version helpers ---------- */

function normalizeVersion(v: string): number[] {
  return v
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((n) => Number(n))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

function compareVersions(a: string, b: string): number {
  const av = normalizeVersion(a);
  const bv = normalizeVersion(b);
  const len = Math.max(av.length, bv.length);

  for (let i = 0; i < len; i++) {
    const x = av[i] ?? 0;
    const y = bv[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function getCurrentVersion() {
  return (
    Constants.nativeApplicationVersion ||
    (Constants.expoConfig?.version as string | undefined) ||
    "0.0.0"
  );
}

function getAndroidPackageName() {
  return (
    (Constants.expoConfig?.android?.package as string | undefined) ||
    (Constants.expoConfig?.extra?.androidPackage as string | undefined) ||
    ""
  ).trim();
}

function getDefaultStoreUrl() {
  if (Platform.OS === "android") {
    const packageName = getAndroidPackageName();
    if (!packageName) return "";
    return `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`;
  }

  const iosAppStoreId = String(Constants.expoConfig?.extra?.iosAppStoreId ?? "").trim();
  return iosAppStoreId ? `https://apps.apple.com/app/id${iosAppStoreId}` : "";
}

/* ---------- App Store lookup ---------- */

function getPreferredCountry(): string {
  // expo-localization v17+ → getLocales()
  const region =
    Localization.getLocales?.()?.[0]?.regionCode ??
    Localization.getLocales?.()?.[0]?.languageTag?.split("-")?.[1];

  return typeof region === "string" ? region.toUpperCase() : "US";
}

async function fetchIosAppStoreInfo(appId: string): Promise<{
  storeVersion: string | null;
  storeUrl: string | null;
}> {
  const primaryCountry = getPreferredCountry();

  // robuste Fallback-Reihenfolge
  const countries = Array.from(
    new Set([primaryCountry, "AT", "DE", "US"])
  );

  for (const country of countries) {
    try {
      const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(
        appId
      )}&country=${country}`;

      const res = await fetch(url);
      const json = await res.json();
      const first = json?.results?.[0];

      if (first?.version && first?.trackViewUrl) {
        return {
          storeVersion: String(first.version),
          storeUrl: String(first.trackViewUrl),
        };
      }
    } catch {
      // try next country
    }
  }

  return { storeVersion: null, storeUrl: null };
}

/* ---------- Public API ---------- */

export async function checkAndPromptForUpdateIos(
  appId: string,
  options: UpdateOptions = {}
): Promise<void> {
  const info = await getRequiredIosUpdateInfo(appId);
  if (!info) return;

  const lastPrompted = await AsyncStorage.getItem(LAST_PROMPTED_KEY);
  if (!options.force && lastPrompted === info.storeVersion) return;

  await AsyncStorage.setItem(LAST_PROMPTED_KEY, info.storeVersion);

  const force = !!options.force;

  Alert.alert(
    i18n.t("appUpdate.availableTitle"),
    i18n.t("appUpdate.availableBody", { version: info.storeVersion }),
    force
      ? [
          {
            text: i18n.t("appUpdate.updateNow"),
            onPress: () => Linking.openURL(info.storeUrl),
          },
        ]
      : [
          { text: i18n.t("appUpdate.later"), style: "cancel" },
          {
            text: i18n.t("appUpdate.updateNow"),
            onPress: () => Linking.openURL(info.storeUrl),
          },
        ],
    { cancelable: !force }
  );
}

export async function getRequiredIosUpdateInfo(appId: string): Promise<AppUpdateInfo | null> {
  if (Platform.OS !== "ios") return null;
  if (!appId.trim()) return null;

  const { storeVersion, storeUrl } = await fetchIosAppStoreInfo(appId);
  if (!storeVersion || !storeUrl) return null;

  const currentVersion =
    Constants.nativeApplicationVersion ||
    (Constants.expoConfig?.version as string | undefined) ||
    "0.0.0";

  if (compareVersions(storeVersion, currentVersion) <= 0) return null;

  return {
    currentVersion,
    storeVersion,
    storeUrl,
  };
}

export async function getRequiredUpdateInfo(
  client: ApolloClient<any>,
  options: { appSlug?: string } = {}
): Promise<AppUpdateInfo | null> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;

  const currentVersion = getCurrentVersion();
  const platform = Platform.OS === "android" ? "ANDROID" : "IOS";

  try {
    const { data } = await client.query({
      query: APP_RUNTIME_CONFIG,
      variables: {
        platform,
        appSlug: options.appSlug || String(Constants.expoConfig?.extra?.appSlug ?? "").trim() || null,
        currentVersion,
      },
      fetchPolicy: "network-only",
    });

    const remote = data?.appRuntimeConfig;
    const targetVersion = String(remote?.latestVersion || remote?.minSupportedVersion || "").trim();
    const storeUrl = String(remote?.storeUrl || getDefaultStoreUrl()).trim();

    if (!targetVersion || !storeUrl) return null;
    if (compareVersions(targetVersion, currentVersion) <= 0) return null;

    return {
      currentVersion,
      storeVersion: targetVersion,
      storeUrl,
    };
  } catch (e) {
    if (Platform.OS !== "ios") throw e;

    const iosAppStoreId = String(Constants.expoConfig?.extra?.iosAppStoreId ?? "").trim();
    return getRequiredIosUpdateInfo(iosAppStoreId);
  }
}

export function openStoreUpdate(info: Pick<AppUpdateInfo, "storeUrl">) {
  return Linking.openURL(info.storeUrl);
}

export const openAppStoreUpdate = openStoreUpdate;
