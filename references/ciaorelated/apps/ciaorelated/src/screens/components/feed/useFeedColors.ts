import { useTheme } from "../../../theme/ThemeProvider";

export function useFeedColors() {
  const { theme } = useTheme();
  const C = theme.colors;

  // du mapst hier dein Theme auf die Tokens die du brauchst
  return {
    bg: C.bg,
    text: C.text,
    subtext: C.subtext,
    border: C.border,
    card: C.card ?? "transparent",
    primary: C.primary,
    danger: C.danger ?? "#EF4444",
  };
}
