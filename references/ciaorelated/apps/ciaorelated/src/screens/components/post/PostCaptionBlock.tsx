import React from "react";
import { Text, StyleSheet, View } from "react-native";

export function PostCaptionBlock({
  username,
  caption,
  location,
  timeLabel,
  onPressUser,
  C,
}: {
  username: string;
  caption?: string | null;
  location?: string | null;
  timeLabel?: string | null;
  onPressUser?: () => void;
  C: any;
}) {
  const s = React.useMemo(() => styles(C), [C]);

  return (
    <View>
      {!!caption && (
        <Text style={s.caption}>
          <Text style={s.username} onPress={onPressUser}>
            {username}{" "}
          </Text>
          {caption}
        </Text>
      )}

      {!!location && <Text style={s.meta}>{location}</Text>}
      {!!timeLabel && <Text style={s.time}>{timeLabel}</Text>}
    </View>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    caption: { paddingHorizontal: 12, paddingTop: 6, color: C.text },
    username: { fontWeight: "800", color: C.text },
    meta: { paddingHorizontal: 12, paddingTop: 6, color: C.subtext ?? C.sub, fontSize: 12 },
    time: { paddingHorizontal: 12, paddingVertical: 8, color: C.subtext ?? C.sub, fontSize: 12 },
  });
