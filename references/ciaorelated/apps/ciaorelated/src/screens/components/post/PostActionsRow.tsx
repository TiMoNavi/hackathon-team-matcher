import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatCount } from "../feed/formatCount"; // oder wohin du es gelegt hast

export function PostActionsRow({
  liked,
  likes,
  comments,
  onToggleLike,
  onPressLikes,
  onPressComments,
  C,
}: {
  liked: boolean;
  likes: number;
  comments: number;
  onToggleLike: () => void;
  onPressLikes?: () => void;
  onPressComments: () => void;
  C: any;
}) {
  const s = React.useMemo(() => styles(C), [C]);

  return (
    <View style={s.row}>
      {/* ❤️ Heart toggles like */}
      <Pressable onPress={onToggleLike} style={s.iconBtn} hitSlop={10}>
        <Ionicons
          name={(liked ? "heart" : "heart-outline") as any}
          size={24}
          color={liked ? "#ff3b30" : C.text}
        />
      </Pressable>

      {/* ✅ Like count opens list */}
      <Pressable
        onPress={onPressLikes}
        disabled={!onPressLikes}
        style={[s.countBtn, !onPressLikes && { opacity: 0.6 }]}
        hitSlop={10}
      >
        <Text style={s.count}>{formatCount(likes)}</Text>
      </Pressable>

   
      <Pressable onPress={onPressComments} style={[s.btn, { marginLeft: 14 }]}>
        <Ionicons name={"chatbubble-outline" as any} size={24} color={C.text} />
        <Text style={s.count}>{formatCount(comments)}</Text>
      </Pressable>
    </View>
  );
}

const styles = (C: any) =>
  StyleSheet.create({
    row: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 6,
      flexDirection: "row",
      alignItems: "center",
    },
    iconBtn: { flexDirection: "row", alignItems: "center" },
    countBtn: { marginLeft: 6, flexDirection: "row", alignItems: "center" },
    count: { color: C.text, fontWeight: "800" },
    btn: { flexDirection: "row", alignItems: "center", marginRight: 16, gap: 6 },
  });







