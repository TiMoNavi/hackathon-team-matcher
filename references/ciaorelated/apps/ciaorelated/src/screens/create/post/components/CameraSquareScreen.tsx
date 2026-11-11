// =============================================
// File: apps/ciaorelated/src/screens/create/post/components/CameraSquareScreen.tsx
// FIX: keine early returns vor Hooks -> Hook order bleibt stabil
// =============================================

import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { CameraView, useCameraPermissions, type CameraMode } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "react-i18next";

type Result =
  | { canceled: true }
  | {
      canceled: false;
      asset: {
        uri: string;
        type: "photo" | "video";
        width?: number;
        height?: number;
        duration?: number | null;
      };
    };

export function CameraSquareScreen() {
  const { t } = useTranslation();

  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // optional callback aus navigate("CameraSquare", { onDone: (...) => {} })
  const onDone: ((res: Result) => void) =
    route.params?.onDone ??
    ((_: Result) => {
      navigation.goBack();
    });

  const cameraRef = useRef<CameraView>(null);
  const [perm, requestPerm] = useCameraPermissions();

  const [facing, setFacing] = useState<"back" | "front">("back");
  const [mode, setMode] = useState<CameraMode>(route.params?.mode ?? "picture");
  const [recording, setRecording] = useState(false);

  const GUIDE_RATIO = 0.78;
  const s = useMemo(() => styles(), []);

  const close = useCallback(() => {
    onDone({ canceled: true });
  }, [onDone]);

  const takeSquarePhoto = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam) return;

    try {
      const shot = await cam.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });

      const w = (shot as any).width ?? 0;
      const h = (shot as any).height ?? 0;

      let outUri = shot.uri;
      let outW = w;
      let outH = h;

      if (w && h) {
        const side = Math.min(w, h);
        const originX = Math.floor((w - side) / 2);
        const originY = Math.floor((h - side) / 2);

        const cropped = await ImageManipulator.manipulateAsync(
          shot.uri,
          [
            { crop: { originX, originY, width: side, height: side } },
            { resize: { width: 1080, height: 1080 } },
          ],
          { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
        );

        outUri = cropped.uri;
        outW = 1080;
        outH = 1080;
      }

      onDone({
        canceled: false,
        asset: { uri: outUri, type: "photo", width: outW, height: outH, duration: null },
      });
    } catch {
      // noop
    }
  }, [onDone]);

  const toggleRecord = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam) return;

    if (recording) {
      try {
        await cam.stopRecording();
      } catch {}
      return;
    }

    try {
      setRecording(true);
      const rec = await cam.recordAsync({ maxDuration: 90 });
      setRecording(false);

      if (!rec?.uri) return;

      onDone({
        canceled: false,
        asset: { uri: rec.uri, type: "video", duration: null },
      });
    } catch {
      setRecording(false);
    }
  }, [recording, onDone]);

  // ✅ Ab hier nur noch Render-Logik (keine neuen Hooks mehr!)
  const granted = !!perm?.granted;

  return (
    <View style={s.root}>
      {!granted ? (
        <View style={[s.permWrap, { paddingTop: insets.top + 20 }]}>
          <Text style={s.title}>{t("camerasquare.cameraAccess")}</Text>
          <Text style={s.sub}>{t("camerasquare.pleaseAllowAccessToTheCamera")}</Text>

          <TouchableOpacity style={s.primaryBtn} onPress={requestPerm} activeOpacity={0.85}>
            <Text style={s.primaryTxt}>{t("camerasquare.allow")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.ghostBtn} onPress={close} activeOpacity={0.85}>
            <Text style={s.ghostTxt}>{t("camerasquare.cancel")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode={mode}
            videoStabilizationMode="auto"
          />

          {/* Overlay */}
          <View pointerEvents="none" style={s.overlay}>
            <View style={s.overlayTop} />
            <View style={s.overlayMidRow}>
              <View style={s.overlaySide} />
              <View style={[s.guideSquare, { width: `${GUIDE_RATIO * 100}%`, aspectRatio: 1 }]} />
              <View style={s.overlaySide} />
            </View>
            <View style={s.overlayBottom} />
          </View>

          {/* Top bar */}
          <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={close} style={s.iconBtn} activeOpacity={0.85}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setFacing((p) => (p === "back" ? "front" : "back"))}
                style={s.iconBtn}
                activeOpacity={0.85}
              >
                <Ionicons name="camera-reverse" size={22} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (recording) return;
                  setMode((m) => (m === "picture" ? "video" : "picture"));
                }}
                style={s.modePill}
                activeOpacity={0.85}
              >
                <Text style={s.modeTxt}>{mode === "picture" ? "Foto" : "Video"}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom controls */}
          <View style={[s.bottomBar, { paddingBottom: insets.bottom + 18 }]}>
            <TouchableOpacity
              onPress={mode === "picture" ? takeSquarePhoto : toggleRecord}
              activeOpacity={0.85}
              style={[s.shutterOuter, recording && { opacity: 0.9 }]}
            >
              <View style={[s.shutterInner, recording && s.shutterInnerRec]} />
            </TouchableOpacity>

            {mode === "video" && (
              <Text style={s.hint}>{recording ? "Aufnahme…" : "Tippen zum Aufnehmen"}</Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = () =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: "#000" },

    permWrap: { flex: 1, paddingHorizontal: 16 },

    title: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 6 },
    sub: { color: "rgba(255,255,255,0.75)", marginBottom: 14 },

    primaryBtn: {
      backgroundColor: "#fff",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      alignSelf: "flex-start",
    },
    primaryTxt: { color: "#000", fontWeight: "800" },
    ghostBtn: { marginTop: 12 },
    ghostTxt: { color: "rgba(255,255,255,0.75)", fontWeight: "700" },

    topBar: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(0,0,0,0.35)",
      alignItems: "center",
      justifyContent: "center",
    },
    modePill: {
      height: 44,
      paddingHorizontal: 14,
      borderRadius: 22,
      backgroundColor: "rgba(0,0,0,0.35)",
      alignItems: "center",
      justifyContent: "center",
    },
    modeTxt: { color: "#fff", fontWeight: "800" },

    bottomBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    shutterOuter: {
      width: 78,
      height: 78,
      borderRadius: 39,
      borderWidth: 5,
      borderColor: "#fff",
      alignItems: "center",
      justifyContent: "center",
    },
    shutterInner: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: "#fff",
    },
    shutterInnerRec: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: "#ff3b30",
    },
    hint: { color: "rgba(255,255,255,0.75)", fontWeight: "700" },

    overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center" },
    overlayTop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
    overlayMidRow: { flexDirection: "row", alignItems: "center" },
    overlaySide: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
    guideSquare: {
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.85)",
      borderRadius: 12,
      backgroundColor: "transparent",
    },
    overlayBottom: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  });
