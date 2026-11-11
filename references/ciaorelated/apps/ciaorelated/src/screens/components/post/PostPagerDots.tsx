import React from "react";
import { View, StyleSheet } from "react-native";

export function PostPagerDots({
  count,
  index,
  C,
}: {
  count: number;
  index: number;
  C: any;
}) {
  if (count <= 1) return null;
  const s = React.useMemo(() => styles(C), [C]);

  return (
    <View style={s.row}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[s.dot, i === index ? s.dotActive : s.dotInactive]} />
      ))}
    </View>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    row: { marginTop: 8, flexDirection: "row", justifyContent: "center", gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    dotActive: { backgroundColor: C.text },
    dotInactive: { backgroundColor: "rgba(150,150,150,0.5)" },
  });
