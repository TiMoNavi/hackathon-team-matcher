import React from "react";
import { Text, StyleSheet } from "react-native";

type Colors = {
  text: string;
};

export function PostCaption({
  username,
  caption,
  C,
}: {
  username: string;
  caption?: string | null;
  C: Colors;
}) {
  if (!caption) return null;

  return (
    <Text style={[s.caption, { color: C.text }]}>
      <Text style={s.username}>{username} </Text>
      {caption}
    </Text>
  );
}

const s = StyleSheet.create({
  caption: {
    paddingHorizontal: 12,
    paddingTop: 6,
    fontSize: 14,
    lineHeight: 18,
  },
  username: { fontWeight: "800" },
});
