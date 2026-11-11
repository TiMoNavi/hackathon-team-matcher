// apps/ciaorelated/src/screens/create/post/PostCamera.tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeProvider";

import { StoryCamera, type Shot } from "./StoryCamera";

import { useTranslation } from "react-i18next";

type Result = { uri: string; isVideo?: boolean; durationSec?: number };

export function PostCamera({
  onCancel,
  onCapture,
  maxVideoSeconds = 90,
}: {
  onCancel: () => void;
  onCapture: (result: Result) => void | Promise<void>;
  maxVideoSeconds?: number;
}) {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const C = theme.colors as any;
  const s = styles(C);
  const insets = useSafeAreaInsets();

  const [facing, setFacing] = useState<"back" | "front">("back");
  const [busyPick, setBusyPick] = useState(false);

  const chromeBg =
    typeof C.card === "string" && C.card.startsWith("#")
      ? hexToRgba(C.card, 0.72)
      : "rgba(0,0,0,0.45)";

  const closeTop = Math.max(12, insets.top ?? 0);
  const bottomCenterY = Math.max(insets.bottom + 64, 76);

  const toggleFacing = useCallback(() => {
    setFacing((p) => (p === "back" ? "front" : "back"));
  }, []);

  const pickFromLibrary = useCallback(async () => {
    try {
      setBusyPick(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        setBusyPick(false);
        return Alert.alert(t("postcamera.permissionTitle"), t("postcamera.permissionBody"));
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: maxVideoSeconds,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });

      if (res.canceled) {
        setBusyPick(false);
        return;
      }

      const a = res.assets[0];
      if (!a?.uri) {
        setBusyPick(false);
        return;
      }

      if (a.type === "video") {
        const raw = (a as any).duration ?? 0;
        const sec = raw > 1800 ? Math.round(raw / 1000) : Math.round(raw);
        if (sec > maxVideoSeconds) {
          setBusyPick(false);
          return Alert.alert(t("postcamera.videoTooLongTitle"), t("postcamera.videoTooLongBody", { seconds: maxVideoSeconds }));
        }
        await onCapture({ uri: a.uri, isVideo: true, durationSec: sec });
      } else {
        await onCapture({ uri: a.uri, isVideo: false });
      }

      setBusyPick(false);
    } catch (e) {
      setBusyPick(false);
      console.warn("pickFromLibrary error", e);
    }
  }, [maxVideoSeconds, onCapture, t]);

  const onShot = useCallback(
    async (shot: Shot) => {
      if (shot.type === "video") {
        await onCapture({ uri: shot.uri, isVideo: true });
      } else {
        await onCapture({ uri: shot.uri, isVideo: false });
      }
    },
    [onCapture]
  );

  return (
    <View style={[s.root, { backgroundColor: "#000" }]}>
      {/* Top-left: Close */}
      <View style={[s.topLeftWrap, { top: closeTop }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={onCancel}
          style={[s.iconBtn, { backgroundColor: chromeBg, borderColor: C.border }]}
          activeOpacity={0.85}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={18} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* Top-right: Picker + Flip */}
      <View style={[s.topRightWrap, { top: closeTop }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={pickFromLibrary}
          disabled={busyPick}
          style={[
            s.iconBtn,
            { backgroundColor: chromeBg, borderColor: C.border, opacity: busyPick ? 0.7 : 1 },
          ]}
          activeOpacity={0.85}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {busyPick ? <ActivityIndicator color={C.text} /> : <Ionicons name="images-outline" size={18} color={C.text} />}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={toggleFacing}
          style={[s.iconBtn, { backgroundColor: chromeBg, borderColor: C.border, marginTop: 10 }]}
          activeOpacity={0.85}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="camera-reverse-outline" size={18} color={C.text} />
        </TouchableOpacity>
      </View>

      <StoryCamera
        facing={facing}
        onShot={onShot}
        maxVideoDurationSec={maxVideoSeconds}
        renderShutter={({ ready, recording, onPressIn, onPressOut }:any) => (
          <View style={[s.bottomCenterWrap, { bottom: bottomCenterY }]} pointerEvents="box-none">
            <Pressable
              disabled={!ready}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              hitSlop={{ top: 16, bottom: 16, left: 24, right: 24 }}
              style={({ pressed }) => [
                s.shutterBtn,
                pressed && !recording ? s.shutterPressed : null,
                recording ? s.shutterRecording : null,
                !ready ? s.shutterDisabled : null,
              ]}
              accessibilityRole="button"
              testID="post-shutter"
            >
              <View style={[s.shutterInner, recording ? s.shutterInnerRec : undefined]} />
            </Pressable>

            {/* (optional) mini hint */}
            <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.75)", fontWeight: "700", fontSize: 12 }}>
              {t("postcamera.tapPhotoHoldVideo")}</Text>
          </View>
        )}
      />
    </View>
  );
}

const hexToRgba = (hex: string, a: number) => {
  const h = (hex || "").replace("#", "").trim();
  if (h.length !== 6) return `rgba(0,0,0,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return `rgba(0,0,0,${a})`;
  return `rgba(${r},${g},${b},${a})`;
};

const styles = (C: any) =>
  StyleSheet.create({
    root: { flex: 1 },

    topLeftWrap: { position: "absolute", left: 12, zIndex: 200 },
    topRightWrap: { position: "absolute", right: 12, zIndex: 200 },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: "center",
      justifyContent: "center",
    },

    bottomCenterWrap: {
      position: "absolute",
      left: "50%",
      transform: [{ translateX: -33 }],
      zIndex: 120,
      alignItems: "center",
      justifyContent: "center",
    },

    shutterBtn: {
      width: 66,
      height: 66,
      borderRadius: 33,
      borderWidth: 4,
      borderColor: "#fff",
      backgroundColor: "#0b0b0b",
      alignItems: "center",
      justifyContent: "center",
    },
    shutterPressed: { transform: [{ scale: 0.96 }] },
    shutterDisabled: { opacity: 0.45 },
    shutterRecording: { width: 86, height: 86, borderRadius: 43, borderColor: "#ff5a5f" },

    shutterInner: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "#e5e5e5",
    },
    shutterInnerRec: { width: 30, height: 30, borderRadius: 6, backgroundColor: "#ff5a5f" },
  });
