// apps/ciaorelated/src/screens/create/BottomCreateBar.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";

import Animated, {
  Easing,
  Extrapolate,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS
} from "react-native-reanimated";

import { useTheme } from "../../theme/ThemeProvider";
import type { Mode as CreateMode } from "./CreateMediaRoot";

export type StoryBarActions = {
  pick?: () => void;
  flip?: () => void;
  canPick?: boolean;
  canFlip?: boolean;
};

const MODES = ["BEITRAG", "STORY"] as const;

// ✅ deine neue Pill-Breite (muss in wrapStyle UND barStyle identisch sein)
const PILL_WIDTH = 0.46;

export function BottomCreateBar({
  mode,
  onChange,
  storyPreviewUri,
  storyActions,
}: {
  mode: CreateMode;
  onChange: (m: CreateMode) => void;
  storyPreviewUri: string | null;
  storyActions?: StoryBarActions | null;
}) {
  const { theme } = useTheme();
  const c = theme.colors as any;
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const { t, i18n } = useTranslation();

  const modeLabel = useCallback(
    (m: (typeof MODES)[number]) => {
      if (m === "BEITRAG") return t("bottomcreatebar.modes.post");
      return t("bottomcreatebar.modes.story");
    },
    [t, i18n.language]
  );

  /**
   * ✅ Optimistic UI: Bar reagiert SOFORT beim Tap (unabhängig davon,
   * wann der Parent/Upload/Validation den echten `mode` setzt).
  */
  const [uiMode, setUiMode] = useState<CreateMode>(mode);
  const uiModeRef = useRef<CreateMode>(mode);

  useEffect(() => {
    uiModeRef.current = mode;
    setUiMode(mode);
  }, [mode]);

  const setMode = useCallback((next: CreateMode) => {
    const current = uiModeRef.current;
    if (next === current) return;
    uiModeRef.current = next;
    setUiMode(next);
    onChange(next);
  }, [onChange]);


  const modeIdx = useSharedValue(MODES.indexOf(uiMode as any));


  useEffect(() => {
    modeIdx.value = MODES.indexOf(uiMode as any);
  }, [uiMode]);



  const activeMode = uiMode;
  const isStory = activeMode === "STORY";

  // 0 = Pill (Beitrag/Vlog), 1 = StoryBar
  const p = useSharedValue(0);

  // 0 = STORY, +1 = BEITRAG
  const dock = useSharedValue(0);

  const DUR = 170;

  useEffect(() => {
    p.value = withTiming(isStory ? 1 : 0, {
      duration: DUR,
      easing: Easing.out(Easing.cubic),
    });
    dock.value = withTiming(uiMode === "BEITRAG" ? 1 : 0, {
      duration: DUR,
      easing: Easing.out(Easing.cubic),
    });
  }, [isStory, uiMode]);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])   // erst reagieren wenn wirklich horizontal
    .failOffsetY([-12, 12])     // wenn zu vertikal -> abbrechen
    .onEnd((e) => {
      const dx = e.translationX;
      const vx = e.velocityX;

      const idx = modeIdx.value;

      // Thresholds (anpassbar)
      const SWIPE_DIST = 24;     // px
      const SWIPE_VEL = 600;     // px/s

      const swipeLeft = dx < -SWIPE_DIST || vx < -SWIPE_VEL;
      const swipeRight = dx > SWIPE_DIST || vx > SWIPE_VEL;

      if (!swipeLeft && !swipeRight) return;

      // Links wischen => nächster Mode (nach rechts in der Liste)
      const nextIdx = swipeLeft ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= MODES.length) return;

      const next = MODES[nextIdx] as CreateMode;
      runOnJS(setMode)(next);
  });


  const canPick = storyActions?.canPick !== false && !!storyActions?.pick;
  const canFlip = storyActions?.canFlip !== false && !!storyActions?.flip;

  const pillBorder = "rgba(255,255,255,0.14)";
  const pillText = "rgba(255,255,255,0.92)";
  const pillSubtext = "rgba(255,255,255,0.62)";

  // ✅ Beitrag-Lift (die “exakte” Y-Position die du behalten willst)
  const LIFT = 12;

  // Wrapper: Beitrag floatet hoch, Story klebt unten
  // + Pill “dockt” leicht nach rechts/links (Instagram-like)
  const wrapStyle = useAnimatedStyle(() => {
    const bottom = interpolate(
      p.value,
      [0, 1],
      [(insets.bottom ?? 0) + LIFT, 0],
      Extrapolate.CLAMP
    );

    // ✅ muss zur echten Pill-Breite passen
    const widthPct = interpolate(p.value, [0, 1], [PILL_WIDTH, 1.0], Extrapolate.CLAMP);
    const leftover = screenW * (1 - widthPct);
    const maxShift = Math.max(0, leftover / 2 - 16);
    const shiftX = interpolate(p.value, [0, 1], [dock.value * maxShift * 0.12, 0], Extrapolate.CLAMP);

    return {
      position: "absolute",
      left: 0,
      right: 0,
      bottom,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      elevation: 9999,
      transform: [{ translateX: shiftX }],
    };
  }, [insets.bottom, screenW]);

  // Bar: Story nutzt SafeArea unten (kein toter Bereich), Beitrag bleibt kompakt
  const barStyle = useAnimatedStyle(() => {
    // ✅ Pill etwas kleiner (Höhe + Länge)
    const baseH = interpolate(p.value, [0, 1], [48, 98], Extrapolate.CLAMP);

    // Radius: Pill -> 0 in Story
    const radius = interpolate(p.value, [0, 1], [20, 0], Extrapolate.CLAMP);

    // ✅ muss zur wrapStyle Breite passen
    const widthPct = interpolate(p.value, [0, 1], [PILL_WIDTH, 1.0], Extrapolate.CLAMP);

    // ✅ Story: SafeArea ist Teil der Bar (nutzt den Bereich)
    const padBottom = interpolate(p.value, [0, 1], [0, insets.bottom ?? 0], Extrapolate.CLAMP);

    // ✅ Story: keine Border (sonst wirkt es wie “2 Abschnitte”)
    const borderW = interpolate(p.value, [0, 1], [StyleSheet.hairlineWidth, 0], Extrapolate.CLAMP);

    // ✅ Pill: grau/schwarz
    const pillBg = "rgba(18,18,18,0.78)";

    return {
      height: baseH + padBottom,
      width: `${Math.round(widthPct * 100)}%`,
      borderRadius: radius,
      paddingBottom: padBottom,
      backgroundColor: isStory ? "transparent" : pillBg,
      borderColor: isStory ? "transparent" : pillBorder,
      borderWidth: borderW,
      overflow: "hidden",

      shadowColor: "#000",
      shadowOpacity: 0.22,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 10,
    };
  }, [insets.bottom, c.bg, c.border, isStory]);

  // Tabs-Block ist ABSOLUT positioniert:
  // - Beitrag: bottom = 0 (weil Bar selbst schon hochfloatet)
  // - Story: bottom = insets.bottom + LIFT (damit Text EXAKT gleiche Y-Position hat wie Beitrag)
  const tabsBlockStyle = useAnimatedStyle(() => {
    const bottomInsideBar = interpolate(
      p.value,
      [0, 1],
      [0, (insets.bottom ?? 0) + LIFT],
      Extrapolate.CLAMP
    );

    return {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: bottomInsideBar,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
    };
  }, [insets.bottom]);

  const tabsRowStyle = useAnimatedStyle(() => {
    const widthPct = interpolate(p.value, [0, 1], [1.0, 0.72], Extrapolate.CLAMP);
    const translateX = interpolate(p.value, [0, 1], [0, -10], Extrapolate.CLAMP);
    return {
      width: `${Math.round(widthPct * 100)}%`,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      transform: [{ translateX }],
    };
  });

  if (isStory) {
    return (
      <View
        pointerEvents="box-none"
        style={[
          stylesBar.storyBar,
          { bottom: (insets.bottom ?? 0) + 14 },
        ]}
      >
        <View style={stylesBar.storyContent}>
          <TouchableOpacity
            onPress={() => storyActions?.pick?.()}
            disabled={!canPick}
            activeOpacity={0.85}
            style={[
              stylesBar.iconBtn,
              { borderColor: c.border, opacity: canPick ? 1 : 0.45 },
            ]}
          >
            {storyPreviewUri ? (
              <ExpoImage source={{ uri: storyPreviewUri }} style={stylesBar.preview} />
            ) : (
              <Ionicons name="images-outline" size={22} color={c.text} />
            )}
          </TouchableOpacity>

          <View style={stylesBar.storyTabs}>
            {MODES.map((m) => {
              const active = m === activeMode;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setMode(m as CreateMode)}
                  activeOpacity={0.85}
                  style={[stylesBar.tabBtn, stylesBar.storyTabBtn]}
                >
                  <Text
                    style={[
                      stylesBar.tabText,
                      { color: active ? c.text : c.subtext },
                    ]}
                    numberOfLines={1}
                  >
                    {modeLabel(m)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            onPress={() => storyActions?.flip?.()}
            disabled={!canFlip}
            activeOpacity={0.85}
            style={[
              stylesBar.iconBtn,
              { borderColor: c.border, opacity: canFlip ? 1 : 0.45 },
            ]}
          >
            <Ionicons name="camera-reverse-outline" size={22} color={c.text} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <GestureDetector gesture={swipeGesture}>
    <Animated.View style={wrapStyle} pointerEvents="box-none">
      <Animated.View style={[stylesBar.bar, barStyle]}>
        {/* Tabs */}
        <Animated.View style={tabsBlockStyle} pointerEvents="box-none">
          <Animated.View style={tabsRowStyle}>
            {MODES.map((m) => {
              const active = m === activeMode;

              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setMode(m as CreateMode)}
                  activeOpacity={0.85}
                  style={[stylesBar.tabBtn, !isStory ? stylesBar.tabBtnPillSpacing : null]}
                >
                  <Text
                    style={[
                      stylesBar.tabText,
                      { color: active ? pillText : pillSubtext },
                    ]}
                    numberOfLines={1}
                  >
                    {modeLabel(m)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
    </GestureDetector>
  );
}

const stylesBar = StyleSheet.create({
  bar: {
    justifyContent: "center",
  },

  storyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 9999,
    elevation: 9999,
  },

  storyContent: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  storyTabs: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateX: -4 }],
  },

  sideRow: {
    justifyContent: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },

  sideWrap: {
    width: 60,
    alignItems: "center",
    justifyContent: "center",
  },

  rightSideNudge: {
    transform: [{ translateX: -10 }],
  },

  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "transparent",
  },

  preview: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },

  tabBtn: {
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 9, // ✅ wie in deinem Snippet
    alignItems: "center",
    justifyContent: "center",
  },

  storyTabBtn: {
    transform: [{ translateY: 1 }],
  },

  tabBtnPillSpacing: {
    marginHorizontal: 0, // ✅ wie in deinem Snippet
  },

  tabText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
