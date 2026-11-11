type AppPlatform = "IOS" | "ANDROID";

const cleanEnv = (value: string | undefined) => (value || "").trim();

const envKeyPart = (value: string | undefined | null) =>
  (value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function readAppEnv(appSlug: string | undefined | null, platform: AppPlatform, name: string) {
  const slug = envKeyPart(appSlug);
  const keys = [
    slug ? `APP_${slug}_${platform}_${name}` : "",
    `APP_${platform}_${name}`,
  ].filter(Boolean);

  for (const key of keys) {
    const value = cleanEnv(process.env[key]);
    if (value) return value;
  }

  return "";
}

export default {
  Query: {
    appRuntimeConfig: (
      _: unknown,
      {
        platform,
        appSlug,
      }: {
        platform: AppPlatform;
        appSlug?: string | null;
        currentVersion?: string | null;
      }
    ) => {
      const normalizedPlatform = platform === "ANDROID" ? "ANDROID" : "IOS";
      const minSupportedVersion = readAppEnv(appSlug, normalizedPlatform, "MIN_SUPPORTED_VERSION");
      const latestVersion =
        readAppEnv(appSlug, normalizedPlatform, "LATEST_VERSION") || minSupportedVersion;
      const storeUrl = readAppEnv(appSlug, normalizedPlatform, "STORE_URL");

      return {
        platform: normalizedPlatform,
        minSupportedVersion: minSupportedVersion || null,
        latestVersion: latestVersion || null,
        storeUrl: storeUrl || null,
      };
    },
  },
};
