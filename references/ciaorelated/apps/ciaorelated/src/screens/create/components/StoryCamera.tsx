// apps/ciaorelated/src/components/camera/StoryCamera.tsx
import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";

import { useTheme } from "../../../theme/ThemeProvider";
import { hapticImpact, hapticSuccess } from "../../../lib/safeHaptics";
import { useIsFocused } from "@react-navigation/core";

import { useTranslation } from "react-i18next";

export type Shot =
  | { type: "photo"; uri: string; width?: number; height?: number }
  | { type: "video"; uri: string };
  
export type StoryCameraShutterHandlers = {
  ready: boolean;
  recording: boolean;
  onPressIn: (event?: any) => void;
  onPressOut: () => void;
  onTouchMove: (event?: any) => void;
};

export type StoryCameraTopCtx = {
  ready: boolean;
  recording: boolean;
};

export function StoryCamera({
  onShot,
  facing,
  torch,
  renderTop,
  renderShutter,
  timerSec,
  onCountdown,
  onReadyChange,
  enabled = true,
  maxVideoDurationSec = 30,
}: {
  onShot: (s: Shot) => void | Promise<void>;
  facing: "back" | "front";
  torch?: boolean;
  timerSec?: 0 | 3 | 10;
  onCountdown?: (n: number) => void;
  renderTop?: (ctx: StoryCameraTopCtx) => React.ReactNode;
  renderShutter?: (handlers: StoryCameraShutterHandlers) => React.ReactNode;
  onReadyChange?: (ready: boolean) => void;
  enabled?: boolean;
  maxVideoDurationSec?: number;
}) {
  const { t } = useTranslation();

  const { theme } = useTheme();
  const COLORS = theme.colors as any;

  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const isFocused = useIsFocused();

  const camRef = useRef<CameraView | null>(null);

  const [ready, setReady] = useState(false);

  // recording state (UI)
  const [recording, setRecording] = useState(false);

  // internal recording guard (reliable)
  const recordingRef = useRef(false);

  // timer badge
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const timerIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // shutter long-press
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedRef = useRef(false);

  const stopRequestedRef = useRef(false);
  const recordPromiseRef = useRef<Promise<any> | null>(null);

  const LONG_MS = 280;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // countdown
  const countdownRunningRef = useRef(false);
  const countdownTokenRef = useRef(0);
  const mountedRef = useRef(true);

  // zoom
  const [zoom, setZoom] = useState(0);
  const zoomRef = useRef(0);
  const pinchStartZoomRef = useRef(0);
  const shutterStartYRef = useRef<number | null>(null);
  const shutterStartZoomRef = useRef(0);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const beginPinch = () => {
    pinchStartZoomRef.current = zoomRef.current;
  };

  const updatePinch = (scale: number) => {
    const next = pinchStartZoomRef.current + (scale - 1) * 0.18;
    setZoom(clamp(next, 0, 1));
  };

  const pinchZoom = Gesture.Pinch()
    .onBegin(() => runOnJS(beginPinch)())
    .onUpdate((e) => runOnJS(updatePinch)(e.scale));

  const overlayBg =
    typeof COLORS.card === "string" && COLORS.card.startsWith("#")
      ? hexToRgba(COLORS.card, 0.62)
      : "rgba(0,0,0,0.45)";

  // notify parent about ready
  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  // request perms early
  useEffect(() => {
    (async () => {
      if (!camPerm?.granted) await requestCamPerm();
      if (!micPerm?.granted) await requestMicPerm();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recording badge timer
  useEffect(() => {
    if (recording) {
      startedAtRef.current = Date.now();
      setElapsed(0);
      if (timerIdRef.current) clearInterval(timerIdRef.current);
      timerIdRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000);
        setElapsed(sec);
      }, 250);
    } else {
      if (timerIdRef.current) clearInterval(timerIdRef.current);
      timerIdRef.current = null;
      startedAtRef.current = null;
      setElapsed(0);
    }
    return () => {
      if (timerIdRef.current) clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    };
  }, [recording]);

  // enabled toggles -> stop everything safely
  useEffect(() => {
    if (enabled) return;

    countdownTokenRef.current += 1;
    countdownRunningRef.current = false;
    onCountdown?.(0);

    try {
      (camRef.current as any)?.stopRecording?.();
    } catch {}

    recordingRef.current = false;
    recordPromiseRef.current = null;
    stopRequestedRef.current = false;

    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;

    setRecording(false);
    setReady(false);
    onReadyChange?.(false);
  }, [enabled, onCountdown, onReadyChange]);

  // unmount cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;

      countdownTokenRef.current += 1;
      countdownRunningRef.current = false;
      onCountdown?.(0);

      if (timerIdRef.current) clearInterval(timerIdRef.current);
      timerIdRef.current = null;

      if (pressTimer.current) clearTimeout(pressTimer.current);
      pressTimer.current = null;

      try {
        (camRef.current as any)?.stopRecording?.();
      } catch {}

      recordingRef.current = false;
      recordPromiseRef.current = null;
      stopRequestedRef.current = false;

      onReadyChange?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doCountdownIfNeeded = async () => {
    const t = timerSec ?? 0;
    if (!t) return;
    if (countdownRunningRef.current) return;

    const myToken = ++countdownTokenRef.current;
    countdownRunningRef.current = true;

    try {
      for (let i = t; i >= 1; i--) {
        if (!mountedRef.current || countdownTokenRef.current !== myToken) return;
        onCountdown?.(i);
        hapticImpact?.();
        await wait(1000);
        if (!mountedRef.current || countdownTokenRef.current !== myToken) return;
      }
    } finally {
      countdownRunningRef.current = false;
      onCountdown?.(0);
    }
  };

  const takePhoto = async () => {
    try {
      if (!camRef.current || recordingRef.current || !ready) return;

      // ✅ prevents double taps triggering white flash
      if ((takePhoto as any)._busy) return;
      (takePhoto as any)._busy = true;

      await doCountdownIfNeeded();

      // ✅ IMPORTANT: avoid processing mismatch / flash by NOT doing retries and not re-calling takePicture 3x
      const photo = await camRef.current.takePictureAsync({
        quality: 1,
        // iOS “white flash” is often caused by processing pipeline switches.
        // On expo-camera, skipProcessing=true is usually *faster* and avoids extra pipeline work.
        // Keep it TRUE to reduce flash + speed.
        skipProcessing: true,
      });

      if (!photo?.uri) return;

      // ✅ iOS front mirror fix
      let outUri = photo.uri;
      if (facing === "front" && Platform.OS === "ios") {
        const flipped = await ImageManipulator.manipulateAsync(
          outUri,
          [{ flip: ImageManipulator.FlipType.Horizontal }],
          { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
        );
        outUri = flipped.uri;
      }

      await onShot({ type: "photo", uri: outUri, width: photo.width, height: photo.height });
    } catch (e) {
      console.warn("takePhoto error", e);
    } finally {
      (takePhoto as any)._busy = false;
    }
  };

  const startRecordingNow = async () => {
    hapticImpact();
    if (!camRef.current || recordingRef.current || !ready) return;

    stopRequestedRef.current = false;
    recordingRef.current = true;
    setRecording(true);

    try {
      // Countdown *before* recording (so we don't start/stop immediately)
      await doCountdownIfNeeded();

      // if user released during countdown -> do not start
      if (!pressedRef.current) {
        recordingRef.current = false;
        setRecording(false);
        return;
      }

      const p: Promise<any> = (camRef.current as any).recordAsync({
        maxDuration: maxVideoDurationSec,
        mute: !(micPerm?.granted ?? false),
      });

      recordPromiseRef.current = p;

      // if user already requested stop, stop shortly after start
      if (stopRequestedRef.current) {
        setTimeout(() => {
          try {
            (camRef.current as any)?.stopRecording?.();
          } catch {}
        }, 60);
      }

      const video = await p;

      recordPromiseRef.current = null;
      recordingRef.current = false;
      setRecording(false);
      stopRequestedRef.current = false;

      if (video?.uri) await onShot({ type: "video", uri: video.uri });
    } catch (e) {
      recordPromiseRef.current = null;
      recordingRef.current = false;
      setRecording(false);
      stopRequestedRef.current = false;
      console.warn("recordAsync error", e);
    }
  };

  const stopRecordingSafe = async () => {
    hapticSuccess();

    if (!recordingRef.current) {
      stopRequestedRef.current = false;
      return;
    }

    stopRequestedRef.current = true;

    try {
      (camRef.current as any)?.stopRecording?.();
    } catch {}

    // fallback in case first stop is ignored
    setTimeout(() => {
      if (recordingRef.current && recordPromiseRef.current) {
        try {
          (camRef.current as any)?.stopRecording?.();
        } catch {}
      }
    }, 400);
  };

  const onShutterDown = (event?: any) => {
    if (!enabled || !ready) return;
    pressedRef.current = true;
    shutterStartYRef.current = event?.nativeEvent?.pageY ?? null;
    shutterStartZoomRef.current = zoomRef.current;

    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      if (!pressedRef.current) return;
      startRecordingNow();
    }, LONG_MS);
  };

  const onShutterUp = () => {
    pressedRef.current = false;
    shutterStartYRef.current = null;

    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }

    if (recordingRef.current) {
      void stopRecordingSafe();
      return;
    }

    void takePhoto();
  };

  const onShutterMove = (event?: any) => {
    if (!pressedRef.current || !recordingRef.current) return;
    const startY = shutterStartYRef.current;
    const pageY = event?.nativeEvent?.pageY;
    if (typeof startY !== "number" || typeof pageY !== "number") return;
    const dy = startY - pageY;
    const next = shutterStartZoomRef.current + dy * 0.0024;
    setZoom(clamp(next, 0, 1));
  };

  // ---------- RENDER (single exit path) ----------
  if (!camPerm) return <View style={{ flex: 1, backgroundColor: "#000" }} />;

  if (!camPerm.granted) {
    return (
      <View style={s.center}>
        <View style={[s.permissionCard, { backgroundColor: COLORS.card, borderColor: COLORS.border }]}>
          <Ionicons name="camera" size={26} color={COLORS.text} style={{ marginBottom: 10, opacity: 0.9 }} />
          <Text style={{ color: COLORS.text, marginBottom: 10, fontWeight: "800" }}>{t("storycamera.cameraAccessRequired")}</Text>
          <TouchableOpacity
            onPress={requestCamPerm}
            style={[s.permissionBtn, { backgroundColor: COLORS.card, borderColor: COLORS.border }]}
          >
            <Text style={{ color: COLORS.text, fontWeight: "800" }}>{t("storycamera.allow")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!enabled) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {renderTop?.({ ready: false, recording: false })}
        {renderShutter?.({ ready: false, recording: false, onPressIn: () => {}, onPressOut: () => {}, onTouchMove: () => {} })}
      </View>
    );
  }

  const recLabel = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <GestureDetector gesture={pinchZoom}>
        <View style={{ flex: 1 }}>
          <CameraView
            ref={camRef}
            style={{ flex: 1 }}
            facing={facing}
            enableTorch={!!torch}
            mode="video"
            videoQuality="720p"
            zoom={zoom}
            active={isFocused}
            onCameraReady={() => setReady(true)}
            onMountError={(e) => {
              console.warn("Camera mount error", e);
              setReady(false);
              onReadyChange?.(false);
            }}
          />
        </View>
      </GestureDetector>

      {renderTop?.({ ready, recording })}

      {recording && (
        <View style={[s.recBadge, { borderColor: COLORS.border, backgroundColor: overlayBg }]}>
          <Ionicons name="radio-button-on" size={12} color="#ef4444" style={{ marginRight: 6 }} />
          <Text style={{ color: "#fff", fontWeight: "800" }}>{recLabel}</Text>
        </View>
      )}

      {renderShutter?.({ ready, recording, onPressIn: onShutterDown, onPressOut: onShutterUp, onTouchMove: onShutterMove })}
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

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  permissionCard: {
    width: "86%",
    maxWidth: 420,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  permissionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recBadge: {
    position: "absolute",
    top: 24,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
  },
});
