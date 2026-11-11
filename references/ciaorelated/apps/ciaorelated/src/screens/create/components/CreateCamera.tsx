import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../theme/ThemeProvider";
import { StoryCamera, type Shot } from "./StoryCamera";

const { width: W, height: H } = Dimensions.get("window");

// center crop helper
async function cropCenter(uri: string, target: "square" | "story") {
  try {
    // 1) read size
    const info = await ImageManipulator.manipulateAsync(uri, [], { compress: 1, format: ImageManipulator.SaveFormat.JPEG });
    const w = info.width ?? 0;
    const h = info.height ?? 0;
    if (!w || !h) return uri;

    if (target === "square") {
      const side = Math.min(w, h);
      const originX = Math.floor((w - side) / 2);
      const originY = Math.floor((h - side) / 2);
      const out = await ImageManipulator.manipulateAsync(
        uri,
        [
          { crop: { originX, originY, width: side, height: side } },
          { resize: { width: 1080, height: 1080 } },
        ],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
      );
      return out.uri;
    }

    // story 9:16 (1080x1920), center crop
    const targetW = 1080;
    const targetH = 1920;
    const targetAspect = targetW / targetH;
    const srcAspect = w / h;

    let cropW = w;
    let cropH = h;
    if (srcAspect > targetAspect) {
      // too wide -> crop width
      cropW = Math.floor(h * targetAspect);
      cropH = h;
    } else {
      // too tall -> crop height
      cropW = w;
      cropH = Math.floor(w / targetAspect);
    }
    const originX = Math.floor((w - cropW) / 2);
    const originY = Math.floor((h - cropH) / 2);

    const out = await ImageManipulator.manipulateAsync(
      uri,
      [
        { crop: { originX, originY, width: cropW, height: cropH } },
        { resize: { width: targetW, height: targetH } },
      ],
      { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
    );
    return out.uri;
  } catch {
    return uri;
  }
}

type Mode = "post" | "story" | "reels";

export function CreateCamera({
  initialMode = "story",
  onCancel,
  onCapture,
  allowModeSwitch = true,
}: {
  initialMode?: Mode;
  onCancel: () => void;
  onCapture: (res: { uri: string; isVideo: boolean; mode: Mode }) => void;
  allowModeSwitch?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const COLORS = theme.colors as any;

  const [mode, setMode] = useState<Mode>(initialMode);
  const [facing, setFacing] = useState<"back" | "front">("back");

  const isPost = mode === "post";
  const isStory = mode === "story";

  // Frame size: post = square in center, story = 9:16 frame
  const frame = useMemo(() => {
    if (isPost) {
      const size = Math.min(W, Math.floor(H * 0.62));
      return { w: size, h: size };
    }
    // story/reels: 9:16 frame fits screen
    const h = Math.floor(H * 0.72);
    const w = Math.floor(h * (9 / 16));
    const fitW = Math.min(W - 24, w);
    const fitH = Math.floor(fitW * (16 / 9));
    // keep within h
    if (fitH <= h) return { w: fitW, h: fitH };
    return { w, h };
  }, [isPost]);

  const top = Math.max(12, insets.top);
  const bottom = Math.max(18, insets.bottom);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StoryCamera
        facing={facing}
        onShot={async (shot: Shot) => {
          if (shot.type === "video") {
            // Video: wir croppen nicht; Frame ist nur Orientierung
            onCapture({ uri: shot.uri, isVideo: true, mode });
            return;
          }

          // Foto: passend zum gewählten Modus croppen, damit es dem Rahmen entspricht
          const target = isPost ? "square" : "story";
          const cropped = await cropCenter(shot.uri, target);
          onCapture({ uri: cropped, isVideo: false, mode });
        }}
        renderTop={({ recording }:any) => (
          <>
            {/* Top Bar wie Screenshot */}
            <View style={[s.topBar, { paddingTop: top }]}>
              <TouchableOpacity onPress={onCancel} style={s.topIcon} activeOpacity={0.85}>
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              <TouchableOpacity
                onPress={() => setFacing((p) => (p === "back" ? "front" : "back"))}
                style={s.topIcon}
                activeOpacity={0.85}
                disabled={recording}
              >
                <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => {}} style={s.topIcon} activeOpacity={0.85}>
                <Ionicons name="settings-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Frame Overlay */}
            <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
              <View style={s.maskWrap}>
                <View style={[s.maskTop, { height: (H - frame.h) / 2 }]} />
                <View style={{ flexDirection: "row" }}>
                  <View style={[s.maskSide, { width: (W - frame.w) / 2 }]} />
                  <View style={[s.frame, { width: frame.w, height: frame.h }]} />
                  <View style={[s.maskSide, { width: (W - frame.w) / 2 }]} />
                </View>
                <View style={[s.maskBottom, { height: (H - frame.h) / 2 }]} />
              </View>
            </View>
          </>
        )}
        renderShutter={({ ready, recording, onPressIn, onPressOut }:any) => (
          <View style={[s.bottomArea, { paddingBottom: bottom }]}>
            {/* Shutter */}
            <View style={s.shutterRow}>
              <TouchableOpacity
                disabled={!ready}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                activeOpacity={0.9}
                style={[
                  s.shutterBtn,
                  recording && s.shutterRecording,
                  !ready && { opacity: 0.5 },
                ]}
              >
                <View style={[s.shutterInner, recording && s.shutterInnerRec]} />
              </TouchableOpacity>
            </View>

            {/* Tabs wie Screenshot */}
            {allowModeSwitch && (
              <View style={s.tabsRow}>
                <Tab label="BEITRAG" active={mode === "post"} onPress={() => setMode("post")} />
                <Tab label="STORY" active={mode === "story"} onPress={() => setMode("story")} />
                <Tab label="REELS" active={mode === "reels"} onPress={() => setMode("reels")} />
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
      <Text style={{ color: active ? "#fff" : "#9CA3AF", fontWeight: active ? "900" : "700", letterSpacing: 0.5 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 56 + (Platform.OS === "ios" ? 10 : 0),
    zIndex: 200,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  topIcon: { padding: 8 },

  maskWrap: { flex: 1 },
  maskTop: { backgroundColor: "rgba(0,0,0,0.35)" },
  maskBottom: { backgroundColor: "rgba(0,0,0,0.35)" },
  maskSide: { backgroundColor: "rgba(0,0,0,0.35)" },

  frame: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
    borderRadius: 12,
  },

  bottomArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  shutterRow: { alignItems: "center", paddingVertical: 12 },
  shutterBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  shutterRecording: { width: 92, height: 92, borderRadius: 46, borderColor: "#ff5a5f" },
  shutterInner: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#e5e5e5" },
  shutterInnerRec: { width: 32, height: 32, borderRadius: 7, backgroundColor: "#ff5a5f" },

  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 8,
  },
});
