// apps/ciaorelated/src/screens/components/Screen.tsx
import React, { PropsWithChildren, ReactNode } from "react";
import { StatusBar, ViewStyle, TouchableOpacity, Text, View as RNView ,  StyleSheet} from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";
import { ScrollView, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

import { useTranslation } from "react-i18next";

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  backgroundColor?: string;
  barStyle?: "light-content" | "dark-content";
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;

  /** Optionaler Header */
  headerTitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  headerRight?: ReactNode;

  /** SafeArea-Kanten */
  edges?: Edge[];
  statusBarTranslucent?: boolean;
}>;

export default function Screen({
  children,
  scroll = false,
  backgroundColor,
  barStyle,
  style,
  contentContainerStyle,

  headerTitle,
  showBack = false,
  onBack,
  headerRight,

  edges = ["top", "right", "left"],
  statusBarTranslucent = true,
}: ScreenProps) {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const COLORS = theme.colors;

  const Container = scroll ? ScrollView : View;
  const bg = backgroundColor ?? COLORS.bg;
  const finalBarStyle = barStyle ?? theme.statusBar;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={edges}>
      <StatusBar
        barStyle={finalBarStyle}
        translucent={statusBarTranslucent}
        backgroundColor={statusBarTranslucent ? "transparent" : bg}
      />

      {(showBack || headerTitle || headerRight) && (
        <RNView
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: COLORS.border,
            backgroundColor: bg,
          }}
        >
          {/* Left */}
          <RNView style={{ minWidth: 60 }}>
            {showBack && (
              <TouchableOpacity
                onPress={onBack}
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 16, color: COLORS.subtext }}>{t("screen.back")}</Text>
              </TouchableOpacity>
            )}
          </RNView>

          {/* Title */}
          <RNView style={{ flex: 1, alignItems: "center" }}>
            {!!headerTitle && (
              <Text
                style={{ fontSize: 16, fontWeight: "600", color: COLORS.text }}
                numberOfLines={1}
              >
                {headerTitle}
              </Text>
            )}
          </RNView>

          {/* Right */}
          <RNView style={{ minWidth: 60, alignItems: "flex-end" }}>
            {headerRight ?? null}
          </RNView>
        </RNView>
      )}

      <Container
        style={[{ flex: 1, backgroundColor: bg }, style]}
        {...(scroll
          ? {
              contentContainerStyle: [
                { paddingBottom: 24 },
                contentContainerStyle,
              ],
              contentInsetAdjustmentBehavior: "automatic",
              keyboardShouldPersistTaps: "handled",
            }
          : {})}
      >
        {children}
      </Container>
    </SafeAreaView>
  );
}
