export type Theme = {
  mode: "dark" | "light";
  colors: {
    bg: string;
    card: string;
    text: string;
    subtext: string;
    border: string;
    primary: string;
    danger: string;
    hashtag: string;
    accentSoft: string;
    accentSoftText: string;
  };
  statusBar: "light-content" | "dark-content";
};

export const darkTheme: Theme = {
  mode: "dark",
  colors: {
    bg: "#0B0F1A",               // 🔥 DEIN bestehender Dark-Background
    card: "rgba(255,255,255,0.06)",
    text: "#E6ECFF",
    subtext: "#9AA4BF",
    border: "rgba(255,255,255,0.08)",
    primary: "#4F8CFF",
    danger: "#F87171",
    hashtag: "#9B8CFF",
    accentSoft: "#E8F7EF",
    accentSoftText: "#166534",
  },
  statusBar: "light-content",
};

export const lightTheme: Theme = {
  mode: "light",
  colors: {
    bg: "#FFFFFF",
    card: "#F2F3F5",
    text: "#0F172A",
    subtext: "#475569",
    border: "#E5E7EB",
    primary: "#2563EB",
    danger: "#DC2626",
    hashtag: "#6D28D9",
    accentSoft: "#ECFDF5",
    accentSoftText: "#065F46",
  },
  statusBar: "dark-content",
};
