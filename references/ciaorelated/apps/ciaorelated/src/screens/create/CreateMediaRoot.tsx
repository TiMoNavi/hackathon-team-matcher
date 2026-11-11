import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeProvider";

import { PostWizard } from "./post/PostWizard";
import { StoryWizard } from "./StoryWizard";

import Animated, { useAnimatedStyle, useSharedValue, withTiming, interpolate, Extrapolate } from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomCreateBar } from "./BottomCreateBar";



const MODES = ["BEITRAG", "STORY"] as const;
export type Mode = typeof MODES[number];

function normalizeMode(m: any): Mode {
  return (MODES as readonly string[]).includes(m) ? (m as Mode) : "BEITRAG";
}

type StoryBarActions = {
  pick: () => void;
  flip: () => void;
  canPick?: boolean;
  canFlip?: boolean;
} | null;

function sameActions(a: StoryBarActions, b: StoryBarActions) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.pick === b.pick &&
    a.flip === b.flip &&
    a.canPick === b.canPick &&
    a.canFlip === b.canFlip
  );
}

export default function CreateMediaRoot({ navigation, route }: any) {
  const { theme } = useTheme();
  const C = theme.colors as any;

  const paramMode = normalizeMode(route?.params?.initialMode);
  const [mode, setMode] = useState<Mode>(paramMode);
  const modeRef = useRef<Mode>(paramMode);
  const [showBottomBar, setShowBottomBar] = useState(true);
  const [instanceKey, setInstanceKey] = useState(0);


  const [storyActions, _setStoryActions] = useState<StoryBarActions>(null);
  const [storyPreviewUri, setStoryPreviewUri] = useState<string | null>(null);

  const setStoryActions = useCallback((next: StoryBarActions) => {
    _setStoryActions((prev) => (sameActions(prev, next) ? prev : next));
  }, []);

  useEffect(() => {
    const next = normalizeMode(route?.params?.initialMode);
    modeRef.current = next;
    setMode(next);
    setInstanceKey((k) => k + 1);
  }, [route?.params?.initialMode, route?.params?.nonce]);

  useFocusEffect(
    useCallback(() => {
      const next = normalizeMode(route?.params?.initialMode);
      modeRef.current = next;
      setMode(next);
      setInstanceKey((k) => k + 1);
    }, [route?.params?.initialMode])
  );

  const handleExitCreate = () => navigation.goBack();

  const handleCloseAll = useCallback(() => {
    setInstanceKey((k) => k + 1);
    navigation.goBack();
  }, [navigation]);

  const changeMode = useCallback(
    (m: Mode) => {
      if (m === modeRef.current) return;
      modeRef.current = m;
      setMode(m);
      navigation.setParams({ initialMode: m, nonce: Date.now() });
      setInstanceKey((k) => k + 1);
    },
    [navigation]
  );

  return (
    <View style={[s.container, { backgroundColor: C.bg }]}>
      <View style={{ flex: 1 }}>
        {mode === "BEITRAG" && (
          <PostWizard
            onDone={handleExitCreate}
            onToggleBottomBar={setShowBottomBar}
            onCloseAll={handleCloseAll}
          />
        )}

        {mode === "STORY" && (
          <StoryWizard
            key={`story-${instanceKey}`}
            onDone={handleExitCreate}
            onToggleBottomBar={setShowBottomBar}
            sharePostId={route?.params?.sharePostId ?? null}
            onRegisterBarActions={setStoryActions}
            onLastAssetUri={setStoryPreviewUri}
          />
        )}

      </View>

      {showBottomBar && (
        <BottomCreateBar
          mode={mode}
          onChange={changeMode}
          storyPreviewUri={storyPreviewUri}
          storyActions={storyActions}
        />
      )}

    </View>
  );
}

function BottomModeBar({
  mode,
  onChange,
  bg,
  storyActions,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  bg: string;
  storyActions: StoryBarActions;
}) {
  const isStory = mode === "STORY";

  if (isStory) {
    return (
      <View pointerEvents="box-none" style={[s.storyBarWrap, { backgroundColor: bg }]}>
        {/* LEFT: Media Picker */}
        <TouchableOpacity
          onPress={() => storyActions?.pick?.()}
          disabled={storyActions?.canPick === false}
          activeOpacity={0.85}
          style={[s.storySideBtn, storyActions?.canPick === false && { opacity: 0.4 }]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="images-outline" size={22} color="#fff" />
        </TouchableOpacity>

        {/* CENTER: Tabs */}
        <View style={s.storyCenter}>
          <View style={s.storyTabsRow}>
            {MODES.map((m) => {
              const active = m === mode;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => onChange(m)}
                  activeOpacity={0.85}
                  style={s.storyTab}
                >
                  <Text style={[s.storyTabText, active && s.storyTabTextActive]}>{m}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.storyIndicatorTrack}>
            <View
              style={[
                s.storyIndicator,
                {
                  left: `${(MODES.indexOf(mode) / MODES.length) * 100}%`,
                  width: `${100 / MODES.length}%`,
                },
              ]}
            />
          </View>
        </View>

        {/* RIGHT: Camera Switch */}
        <TouchableOpacity
          onPress={() => storyActions?.flip?.()}
          disabled={storyActions?.canFlip === false}
          activeOpacity={0.85}
          style={[s.storySideBtn, storyActions?.canFlip === false && { opacity: 0.4 }]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  // Default Pill (wie gehabt)
  return (
    <View pointerEvents="box-none" style={s.modeBarOverlay}>
      <View style={s.modePill}>
        {MODES.map((m) => {
          const active = m === mode;
          return (
            <TouchableOpacity
              key={m}
              onPress={() => onChange(m)}
              style={[s.modeBtn, active && s.modeBtnActive]}
              activeOpacity={0.85}
            >
              <Text style={[s.modeItem, active && s.modeItemActive]}>{m}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },

  // Default Pill
  modeBarOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.select({ ios: 46, android: 32 }),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    zIndex: 50,
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "86%",
    maxWidth: 520,
    minWidth: 260,
    backgroundColor: "#1B1B1B",
    borderRadius: 22,
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  modeBtnActive: { backgroundColor: "#2B2B2B" },
  modeItem: { color: "#D1D5DB", fontWeight: "800", letterSpacing: 0.5 },
  modeItemActive: { color: "#FFFFFF" },

  // STORY IG Bar (mit bg = C.bg)
  storyBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.select({ ios: 0, android: 0 }),
    paddingTop: 10,
    paddingBottom: Platform.select({ ios: 26, android: 14 }),
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 80,
  },
  storySideBtn: {
    width: 44,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  storyCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  storyTabsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  storyTab: { paddingHorizontal: 6, paddingVertical: 6 },
  storyTabText: {
    color: "rgba(255,255,255,0.55)",
    fontWeight: "700",
    letterSpacing: 2.2,
    fontSize: 13,
  },
  storyTabTextActive: { color: "#FFFFFF" },
  storyIndicatorTrack: {
    marginTop: 6,
    width: "56%",
    maxWidth: 320,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 1,
    overflow: "hidden",
  },
  storyIndicator: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 1,
  },
});
