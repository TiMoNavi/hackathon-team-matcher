// components/EditToggle.tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useTranslation } from "react-i18next";

export function EditToggle({ active, onPress }: { active: boolean; onPress: () => void }) {
  const { t } = useTranslation();

  return (
    <View pointerEvents="box-none" style={s.wrap}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={[s.btn, active && { backgroundColor: "#4F46E5" }]}>
        <Text style={s.txt}>{active ? t("edittoggle.hideEdit") : t("edittoggle.edit")}</Text>
      </TouchableOpacity>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 12,
    // etwas oberhalb (über der Filter-Leiste):
    bottom: Platform.select({ ios: 190, android: 170 }),
    zIndex: 45,
  },
  btn: { backgroundColor: "#1E1E1E", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: "#333" },
  txt: { color: "#E5E7EB", fontWeight: "800" },
});
