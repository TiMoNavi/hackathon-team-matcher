import React, { useMemo } from "react";
import { Text, StyleSheet } from "react-native";

type Colors = {
  subtext: string;
};

export function PostTimestamp({
  createdAt,
  C,
}: {
  createdAt?: string | number | Date | null;
  C: Colors;
}) {
  const label = useMemo(() => {
    if (!createdAt) return "";
    const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  }, [createdAt]);

  if (!label) return null;

  return <Text style={[s.time, { color: C.subtext }]}>{label}</Text>;
}

const s = StyleSheet.create({
  time: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
  },
});
