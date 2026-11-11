declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_WEBSITE_URL?: string;
    EXPO_PUBLIC_ONELINK_URL?: string;
    EXPO_PUBLIC_APP_NAME?: string;
    EXPO_PUBLIC_APP_SLUG?: string;
    EXPO_PUBLIC_APP_SCHEME?: string;
    EXPO_PUBLIC_FEED_HEADER_TEXT?: string;
    EXPO_PUBLIC_QR_CENTER_TEXT?: string;
    EXPO_PUBLIC_SUPPORT_EMAIL?: string;
  }
}

declare var process: {
  env: NodeJS.ProcessEnv;
};
