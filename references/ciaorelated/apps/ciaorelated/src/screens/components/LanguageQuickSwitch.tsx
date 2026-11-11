import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";

import { getLanguageMode, setLanguageMode, type AppLanguageMode } from "../../i18n";
import { useTheme } from "../../theme/ThemeProvider";

type Props = {
  style?: StyleProp<ViewStyle>;
  align?: "left" | "center" | "right";
};

export default function LanguageQuickSwitch({ style, align = "left" }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const C = theme.colors as any;
  const s = useMemo(() => styles(C), [C]);
  const [mode, setMode] = useState<AppLanguageMode>("auto");

  useEffect(() => {
    let alive = true;
    getLanguageMode()
      .then((m) => {
        if (alive) setMode(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo(
    () =>
      [
        { mode: "auto" as const, label: t("settings.language_auto") },
        { mode: "de" as const, label: "DE" },
        { mode: "en" as const, label: "EN" },
      ] as const,
    [t]
  );

  const onPick = useCallback(async (next: AppLanguageMode) => {
    setMode(next);
    await setLanguageMode(next);
  }, []);

  const justifyContent: ViewStyle["justifyContent"] =
    align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";

  return (
    <View style={[s.wrap, { justifyContent }, style]}>
      <View style={s.segment}>
        {options.map((option) => {
          const active = option.mode === mode;
          return (
            <TouchableOpacity
              key={option.mode}
              onPress={() => onPick(option.mode)}
              activeOpacity={0.75}
              style={[s.option, active && s.optionActive]}
            >
              <Text style={[s.optionText, active && s.optionTextActive]} numberOfLines={1}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    wrap: {
      width: "100%",
      flexDirection: "row",
    },
    segment: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      padding: 3,
      borderRadius: 999,
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      gap: 2,
    },
    option: {
      minWidth: 44,
      height: 30,
      paddingHorizontal: 10,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    optionActive: {
      backgroundColor: C.primary,
    },
    optionText: {
      color: C.subtext,
      fontSize: 12,
      fontWeight: "800",
    },
    optionTextActive: {
      color: C.bg,
    },
  });
