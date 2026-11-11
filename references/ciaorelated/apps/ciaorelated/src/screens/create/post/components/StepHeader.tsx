// screens/create/post/components/StepHeader.tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../../theme/ThemeProvider";

import { useTranslation } from "react-i18next";

export function StepHeader({
  title,
  canContinue,
  onLeft,
  onContinue,
  leftKind = "x",
  showContinue = true,
  variant = "default",
}: {
  title: string;
  canContinue: boolean;
  onLeft: () => void;
  onContinue?: () => void;
  leftKind?: "x" | "chevron";
  showContinue?: boolean;
  variant?: "default" | "ig";
}) {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const C = theme.colors as any;

  return variant === "ig" ? (
    <View
      style={[
        s.igRow,
        {
          paddingTop: 0,
          borderBottomColor: C.border,
          backgroundColor: C.bg,
        },
      ]}
    >
      {/* LEFT: Close */}
      <TouchableOpacity
        onPress={onLeft}
        activeOpacity={0.8}
        style={[s.igIconBtn, { borderColor: C.border }]}
      >
        <Ionicons name="close" size={22} color={C.text} />
      </TouchableOpacity>

      {/* CENTER: Titel */}
      <Text style={[s.igTitle, { color: C.text }]} numberOfLines={1}>
        {title}
      </Text>

      {/* RIGHT: Weiter / Platzhalter */}
      {showContinue ? (
        <TouchableOpacity
          onPress={canContinue ? onContinue : undefined}
          disabled={!canContinue}
          activeOpacity={0.85}
          style={s.igNextBtn}
        >
          <Text
            style={[
              s.igNextTxt,
              { color: C.primary },
              !canContinue && { opacity: 0.4 },
            ]}
          >
            {t("stepheader.further")}</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 48 }} />
      )}
    </View>
  ) : (
    <View style={[s.row, { borderBottomColor: C.border, backgroundColor: C.bg }]}>
      <TouchableOpacity onPress={onLeft} activeOpacity={0.8}>
        <Ionicons
          name={leftKind === "chevron" ? "chevron-back" : "close"}
          size={22}
          color={C.text}
        />
      </TouchableOpacity>

      <Text style={[s.title, { color: C.text }]}>{title}</Text>

      {showContinue ? (
        <TouchableOpacity
          onPress={canContinue ? onContinue : undefined}
          disabled={!canContinue}
          activeOpacity={0.8}
        >
          <Text style={[s.cta, { color: C.primary }, !canContinue && { opacity: 0.4 }]}>
            {t("stepheader.further")}</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 48 }} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  igRow: {
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  igTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
  igIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  igNextBtn: {
    minWidth: 48,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  igNextTxt: {
    fontSize: 16,
    fontWeight: "700",
  },

  row: {
    minHeight: 48,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 16, fontWeight: "700" },
  cta: { fontSize: 16, fontWeight: "700" },

  audioPill: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  audioThumb: {
    width: 28,
    height: 28,
    borderRadius: 6,
    opacity: 0.7,
  },
  audioTitle: { fontSize: 13, fontWeight: "800" },
  audioSub: { fontSize: 11, fontWeight: "600", marginTop: 2 },
});
