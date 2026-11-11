import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { AvatarImage } from "./AvatarImage";

type Props = {
  size?: number;                    // 64 default
  thumbUri?: string | null;
  avatarUri?: string | null;
  label: string;

  hasActive: boolean;               // User hat Stories → Ring anzeigen
  onPress?: () => void;
  username?: string | null;

  showPlusWhenInactive?: boolean;   // default: true
  bgColor?: string;                 // "#0B0B0B" default
  avatarBgColor?: string;
  labelColor?: string;
  pressWhenInactive?: boolean;

  // ✅ DB-basiert
  seen?: boolean;                   // true => alle Stories gesehen
};

export default function StoryBubble({
  size = 64,
  thumbUri,
  avatarUri,
  label,
  hasActive,
  onPress,
  showPlusWhenInactive = true,
  bgColor = "#0B0B0B",
  avatarBgColor = "#111",
  labelColor = "#9CA3AF",
  username,
  pressWhenInactive = true,
  seen = false,
}: Props) {
  const inner = size - 6;

  // Plus etwas kleiner (ca. 28% der Bubble)
  const plusSize = Math.round(size * 0.28);
  const plusRadius = plusSize / 2;
  const canPress = hasActive || pressWhenInactive;

  /**
   * ✅ Ring-Styling
   * - ungelesen → kräftig orange
   * - gelesen   → grau & dünner
   */
  const ringColor = seen
    ? "rgba(156,163,175,0.85)" // grau
    : "#F56040";               // Instagram-Orange

  const ringWidth = seen ? 1.25 : 2;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={canPress ? onPress : undefined}
      disabled={!canPress}
      style={{ alignItems: "center" }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: hasActive ? ringWidth : 0,
          borderColor: hasActive ? ringColor : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AvatarImage
          thumb={thumbUri}
          full={avatarUri}
          style={{
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            backgroundColor: avatarBgColor,
          }}
          recyclingKey={`story-avatar:${username ?? label}`}
        />

        {/* ➕ Plus nur wenn KEINE aktive Story */}
        {!hasActive && showPlusWhenInactive && (
          <View
            style={{
              position: "absolute",
              right: -(plusSize * 0.001),
              bottom: -(plusSize * 0.001),
              width: plusSize,
              height: plusSize,
              borderRadius: plusRadius,
              backgroundColor: "#F43F5E",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: bgColor,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: plusSize * 0.7,
                lineHeight: plusSize * 0.85,
                fontWeight: "800",
              }}
            >
              ＋
            </Text>
          </View>
        )}
      </View>

      <Text
        style={{
          color: labelColor, fontSize: 12, marginTop: 6
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
