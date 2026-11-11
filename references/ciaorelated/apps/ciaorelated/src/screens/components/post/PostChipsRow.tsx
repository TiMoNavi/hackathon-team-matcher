import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export function PostChipsRow({
  chips,
  onPressChip,
  C,
}: {
  chips: Array<{ id: string; title?: string | null; slug: string }>;
  onPressChip: (slug: string) => void;
  C: any;
}) {
  if (!Array.isArray(chips) || chips.length === 0) return null;
  const s = React.useMemo(() => styles(C), [C]);

  return (
    <View style={s.row}>
      {chips.map((v) => (
        <TouchableOpacity
          key={v.id}
          onPress={() => onPressChip(v.slug)}
          style={s.chip}
          activeOpacity={0.85}
        >
          <Text style={s.chipText} numberOfLines={1}>
            {v.title || v.slug}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: C.chipBg ?? "#2b2b2b",
    },
    chipText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  });
