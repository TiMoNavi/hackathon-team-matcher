// apps/ciaorelated/app.config.js

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function hostFromUrl(value) {
  const trimmed = trimTrailingSlash(value);
  if (!trimmed) return "";
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return "";
  }
}

const linkDomains = [
  process.env.EXPO_PUBLIC_WEBSITE_URL,
  process.env.EXPO_PUBLIC_ONELINK_URL,
  ...(process.env.EXPO_PUBLIC_ASSOCIATED_DOMAINS || "").split(","),
]
  .map((domain) => String(domain || "").trim())
  .map((domain) => domain.replace(/^applinks:/, ""))
  .map((domain) => domain.replace(/^https?:\/\//i, ""))
  .map((domain) => domain.split("/")[0])
  .map((domain) => hostFromUrl(domain) || domain)
  .filter(Boolean);

const uniqueLinkDomains = Array.from(new Set(linkDomains));
const oneLinkDomain = hostFromUrl(process.env.EXPO_PUBLIC_ONELINK_URL);
const androidJoinLinkData = uniqueLinkDomains
  .filter((host) => host !== oneLinkDomain)
  .map((host) => ({
    scheme: "https",
    host,
    pathPrefix: "/join",
  }));
const androidOneLinkData = oneLinkDomain
  ? [
      {
        scheme: "https",
        host: oneLinkDomain,
      },
    ]
  : [];

const associatedDomains = uniqueLinkDomains
  .map((domain) => domain.trim())
  .filter(Boolean)
  .map((domain) => `applinks:${domain}`);

const easProjectId = process.env.EAS_PROJECT_ID || "";
const appName = process.env.EXPO_PUBLIC_APP_NAME || "ciaorelated";
const appSlug = process.env.EXPO_SLUG || process.env.EXPO_PUBLIC_APP_SLUG || "ciaorelated";
const appScheme = process.env.EXPO_PUBLIC_APP_SCHEME || "ciaorelated";
const appIcon = process.env.EXPO_ICON_PATH || "./assets/cr.png";
const webFavicon = process.env.EXPO_WEB_FAVICON_PATH || appIcon;
const splashImage = process.env.EXPO_SPLASH_IMAGE_PATH || "./assets/splash-icon.png";
const splashBackgroundColor = process.env.EXPO_SPLASH_BACKGROUND_COLOR || "#ffffff";

export default {
  expo: {
    name: appName,
    slug: appSlug,
    scheme: appScheme,
    owner: process.env.EXPO_OWNER,
    version: '1.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    entryPoint: './src/App.tsx',
    icon: appIcon,
    splash: {
      image: splashImage,
      resizeMode: "contain",
      backgroundColor: splashBackgroundColor,
    },

    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
      websiteUrl: process.env.EXPO_PUBLIC_WEBSITE_URL ?? "",
      oneLinkUrl: process.env.EXPO_PUBLIC_ONELINK_URL ?? "",
      appName,
      appSlug,
      appScheme,
      feedHeaderText: process.env.EXPO_PUBLIC_FEED_HEADER_TEXT ?? "",
      qrCenterText: process.env.EXPO_PUBLIC_QR_CENTER_TEXT ?? "",
      supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "",
      iosAppStoreId: process.env.EXPO_PUBLIC_IOS_APP_STORE_ID ?? "",
      appsFlyerDevKey: process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY ?? "",
      appsFlyerEnabled: process.env.EXPO_PUBLIC_APPSFLYER_ENABLED === "true",
      androidPackage: process.env.EXPO_ANDROID_PACKAGE ?? 'com.example.ciaorelated',
      eas: { projectId: easProjectId },
    },
    plugins: [
      "react-native-appsflyer",
      'expo-image-picker',
      "expo-media-library",
      // 👉 Für Store-Builds weglassen, reduziert Pod-Komplexität:
      // 'expo-dev-client',
      [
        'expo-build-properties',
        {
          ios: {
            deploymentTarget: '15.1',
            useFrameworks: 'static',
            flipper: false,
          },
        },
      ],
      [
        'expo-camera',
        {
          // Diese Strings gelten vor allem für Android,
          // aber machen wir auch dort klarer:
          cameraPermission:
            'We use your camera so you can take and upload photos or videos to share with your friends.',
          microphonePermission:
            'We use your microphone to let you record audio in your videos and voice messages.',
          recordAudioAndroid: true,
        },
      ],
      ['expo-location', {
      // android: { foregroundService: { notificationTitle: 'Location in use', notificationBody: 'Updating your location.', } } // only if background
      }],
    ],

    ios: {
      bundleIdentifier: process.env.EXPO_IOS_BUNDLE_IDENTIFIER ?? 'com.example.ciaorelated',
      supportsTablet: true,
      associatedDomains,

      infoPlist: {
        NSPhotoLibraryUsageDescription:
          'We use your photo library so you can select and upload images, for example when setting your profile picture.',
        NSCameraUsageDescription:
          'We use your camera so you can take and upload photos or videos to share with your friends.',
        NSMicrophoneUsageDescription:
          'We use your microphone to let you record audio in your videos and voice messages.',
        NSLocationWhenInUseUsageDescription:
          'We use your location to tag posts and show nearby content.',
      },
    },

    android: {
      package: process.env.EXPO_ANDROID_PACKAGE ?? 'com.example.ciaorelated',
      permissions: [
        'READ_MEDIA_IMAGES',
        'ACCESS_FINE_LOCATION',
      ],
      intentFilters: [
        ...(androidJoinLinkData.length
          ? [
              {
                action: "VIEW",
                autoVerify: true,
                data: androidJoinLinkData,
                category: ["BROWSABLE", "DEFAULT"],
              },
            ]
          : []),
        ...(androidOneLinkData.length
          ? [
              {
                action: "VIEW",
                autoVerify: true,
                data: androidOneLinkData,
                category: ["BROWSABLE", "DEFAULT"],
              },
            ]
          : []),
        {
          action: "VIEW",
          data: [
            {
              scheme: appScheme,
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
      edgeToEdgeEnabled: true,
      softwareKeyboardLayoutMode: "resize"
    },



    web: { favicon: webFavicon },
  },
};
