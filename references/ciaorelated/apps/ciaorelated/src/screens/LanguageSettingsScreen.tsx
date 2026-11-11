import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import Screen from "./components/Screen";
import { useTheme } from "../theme/ThemeProvider";
import { getLanguageMode, setLanguageMode, type AppLanguageMode } from "../i18n";

export default function LanguageSettingsScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const C = theme.colors as any;
  const s = styles(C);

  const { t } = useTranslation();

  const [mode, setMode] = React.useState<AppLanguageMode>("auto");

  React.useEffect(() => {
    getLanguageMode().then(setMode);
  }, []);

  const options = useMemo(
    () =>
      [
        { mode: "auto" as const, label: t("settings.language_auto") },
        { mode: "de" as const, label: t("settings.language_de") },
        { mode: "en" as const, label: t("settings.language_en") },
      ] as const,
    [t]
  );

  const onPick = useCallback(
    async (next: AppLanguageMode) => {
      await setLanguageMode(next);
      setMode(next);
      nav.goBack();
    },
    [nav]
  );

  return (
    <Screen>
      {/* Header */}
      <View style={[s.header, { backgroundColor: C.bg }]}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={12} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>

        <View pointerEvents="none" style={s.titleWrap}>
          <Text style={s.title} numberOfLines={1}>
            {t("settings.language")}
          </Text>
        </View>

        <View style={s.headerBtn} />
      </View>

      <View style={{ padding: 12 }}>
        <View style={s.card}>
          {options.map((o) => {
            const active = mode === o.mode;
            return (
              <TouchableOpacity
                key={o.mode}
                onPress={() => onPick(o.mode)}
                activeOpacity={0.7}
                style={s.row}
              >
                <Text style={s.rowTitle}>{o.label}</Text>
                {active ? (
                  <Ionicons name="checkmark" size={20} color={C.primary} />
                ) : (
                  <Text style={s.rowRight}> </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    header: {
      height: 52,
      paddingHorizontal: 12,
      borderBottomColor: C.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
    },
    titleWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1,
    },
    title: { color: C.text, fontSize: 16, fontWeight: "700" },

    card: {
      backgroundColor: C.card,
      borderRadius: 12,
      overflow: "hidden",
      borderColor: C.border,
      borderWidth: StyleSheet.hairlineWidth,
    },
    row: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomColor: C.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: "600",
    },
    rowRight: { color: C.subtext },
  });
