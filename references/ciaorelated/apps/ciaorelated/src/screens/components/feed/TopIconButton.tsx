import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

export function TopIconButton({
  icon,
  iconLib = "ion",
  onPress,
  badge,
  disabled,
  testID,

  // icon
  color = "#fff",

  // theme-able surfaces
  bgColor = "#1B1E24",
  borderColor = "#2A2F36",

  // badge
  badgeBgColor = "#EF4444",
  badgeBorderColor = "#0B0B0B",
  badgeTextColor = "#fff",
  iconSize = 20,
}: {
  icon: string;
  iconLib?: "ion" | "mci";
  onPress: () => void;
  badge?: number;
  disabled?: boolean;
  testID?: string;

  color?: string;

  bgColor?: string;
  borderColor?: string;

  badgeBgColor?: string;
  badgeBorderColor?: string;
  badgeTextColor?: string;
  iconSize?: number;
}) {
  const badgeText =
    typeof badge === "number" && badge > 0 ? (badge > 99 ? "99+" : String(badge)) : null;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={[
        s.topBtn,
        {
          backgroundColor: bgColor,
          borderColor: borderColor,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {iconLib === "mci" ? (
        <MaterialCommunityIcons name={icon as any} size={iconSize} color={color} />
      ) : (
        <Ionicons name={icon as any} size={iconSize} color={color} />
      )}

      {badgeText && (
        <View
          style={[
            s.badge,
            {
              backgroundColor: badgeBgColor,
              borderColor: badgeBorderColor,
            },
          ]}
        >
          <Text style={[s.badgeText, { color: badgeTextColor }]}>{badgeText}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: "800" },
});
