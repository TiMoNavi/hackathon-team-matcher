// =============================================
// File: components/AlignableSquare.tsx
// =============================================
import React, { useMemo, useRef, useState, useEffect } from "react";
import { View, StyleSheet, Animated, Text } from "react-native";
import {
  PanGestureHandler,
  PinchGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
  type PinchGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";

import { useTranslation } from "react-i18next";

/* ---------- Utils ---------- */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ---------- Types ---------- */
export type AlignState = {
  scale: number; // >= 1
  tx: number;
  ty: number;
};

type Props = {
  size: number;
  mediaW?: number;
  mediaH?: number;

  showGrid: boolean;
  value: AlignState;
  onChange: (next: AlignState) => void;
  onGestureActiveChange?: (active: boolean) => void;

  panRequiresZoom?: boolean;
  panMinPointers?: number;
  fit?: "cover" | "contain";

  /** ✅ NEU: globale Aktivierung */
  enabled?: boolean;

  /** ✅ NEU: fürs UI ok, fürs Baking/Upload AUS (sonst runde Ecken im JPG) */
  rounded?: boolean;

  children: React.ReactNode;
};

/**
 * AlignableSquare
 * - Quadratischer Viewport
 * - Cover-Sizing basierend auf Media-Ratio
 * - Pinch + Pan gleichzeitig (2 Finger), stabil + clamp
 * - Optional: rounded (UI) vs. no radius (Baker)
 */
export function AlignableSquare({
  size,
  mediaW,
  mediaH,
  showGrid,
  value,
  onChange,
  onGestureActiveChange,
  panRequiresZoom,
  panMinPointers,
  fit = "cover",
  enabled = true,
  rounded = false,
  children,
}: Props) {
  const { t } = useTranslation();

  /* ---------- Ratio & Base Size ---------- */
  const ratio = useMemo(() => {
    if (!mediaW || !mediaH) return 1;
    return mediaW / mediaH;
  }, [mediaW, mediaH]);


  const base = useMemo(() => {
  if (!mediaW || !mediaH) return { w: size, h: size };

    const r = mediaW / mediaH;

    if (fit === "cover") {
      // cover: füllt Quadrat -> kann croppen
      if (r >= 1) return { w: size * r, h: size };
      return { w: size, h: size / r };
    } else {
      // contain: ganzes Medium sichtbar -> Balken möglich
      if (r >= 1) return { w: size, h: size / r };
      return { w: size * r, h: size };
    }
  }, [fit, mediaW, mediaH, size]);


  /* ---------- Animated Values ---------- */
  const panX = useRef(new Animated.Value(value.tx)).current;
  const panY = useRef(new Animated.Value(value.ty)).current;
  const scaleA = useRef(new Animated.Value(value.scale)).current;

  // keep in sync when external value changes (e.g. pager switch)
  useEffect(() => {
    panX.setValue(value.tx);
    panY.setValue(value.ty);
    scaleA.setValue(value.scale);
  }, [value.tx, value.ty, value.scale]);

  /* ---------- Gesture Refs (for simultaneous) ---------- */
  const pinchRef = useRef<PinchGestureHandler>(null);
  const panRef = useRef<PanGestureHandler>(null);

  /* ---------- Gesture State ---------- */
  const panStart = useRef({ x: value.tx, y: value.ty });
  const pinchStartScale = useRef(value.scale);
  const [gestureActive, setGestureActive] = useState(false);

  const setActive = (v: boolean) => {
    setGestureActive(v);
    onGestureActiveChange?.(v);
  };

  /* ---------- Helpers to read Animated values safely ---------- */
  const getNum = (a: Animated.Value) => (a as any).__getValue?.() ?? 0;

  /* ---------- Clamp based on a given scale ---------- */
  const calcClamp = (nextScale: number) => {
    const contentW = base.w * nextScale;
    const contentH = base.h * nextScale;

    const maxX = Math.max(0, (contentW - size) / 2);
    const maxY = Math.max(0, (contentH - size) / 2);

    return { maxX, maxY };
  };

  /* ---------- Commit ---------- */
  const commit = (next: AlignState) => {
    panX.setValue(next.tx);
    panY.setValue(next.ty);
    scaleA.setValue(next.scale);
    onChange(next);
  };

  /* ---------- PAN (move) ---------- */
  const onPanGesture = (e: any) => {
    if (!enabled) return;

    const { translationX, translationY } = e.nativeEvent;

    // ✅ clamp mit AKTUELLER scale (nicht stale value.scale)
    const curScale = getNum(scaleA);
    const { maxX, maxY } = calcClamp(curScale);

    const nextTx = clamp(panStart.current.x + translationX, -maxX, maxX);
    const nextTy = clamp(panStart.current.y + translationY, -maxY, maxY);

    panX.setValue(nextTx);
    panY.setValue(nextTy);
  };

  const onPanStateChange = (e: PanGestureHandlerStateChangeEvent) => {
    if (!enabled) return;

    if (e.nativeEvent.state === State.BEGAN) {
      // ✅ start aus aktuellen Animated Werten (nicht props)
      panStart.current = { x: getNum(panX), y: getNum(panY) };
      setActive(true);
    }

    if (e.nativeEvent.oldState === State.ACTIVE) {
      const curScale = getNum(scaleA);
      const { maxX, maxY } = calcClamp(curScale);

      const tx = clamp(getNum(panX), -maxX, maxX);
      const ty = clamp(getNum(panY), -maxY, maxY);

      commit({ scale: curScale, tx, ty });
      setActive(false);
    }
  };

  /* ---------- PINCH (zoom) ---------- */
  const onPinchGesture = (e: any) => {
    if (!enabled) return;

    const nextScale = clamp(pinchStartScale.current * e.nativeEvent.scale, 1, 4);
    scaleA.setValue(nextScale);

    // ✅ während Pinch: wenn aktuelles tx/ty out of bounds wäre -> soft clamp live
    const { maxX, maxY } = calcClamp(nextScale);
    panX.setValue(clamp(getNum(panX), -maxX, maxX));
    panY.setValue(clamp(getNum(panY), -maxY, maxY));
  };

  const onPinchStateChange = (e: PinchGestureHandlerStateChangeEvent) => {
    if (!enabled) return;

    if (e.nativeEvent.state === State.BEGAN) {
      pinchStartScale.current = getNum(scaleA);
      setActive(true);
    }

    if (e.nativeEvent.oldState === State.ACTIVE) {
      const nextScale = clamp(pinchStartScale.current * e.nativeEvent.scale, 1, 4);
      const { maxX, maxY } = calcClamp(nextScale);

      const tx = clamp(getNum(panX), -maxX, maxX);
      const ty = clamp(getNum(panY), -maxY, maxY);

      commit({ scale: nextScale, tx, ty });
      setActive(false);
    }
  };

  // ✅ pan nur erlauben wenn zoom > 1 (optional)
  const panEnabled = enabled && (panRequiresZoom ? getNum(scaleA) > 1.01 : true);

  /* ---------- Render ---------- */
  return (
    <View
      style={[
        s.square,
        rounded ? s.rounded : s.notRounded,
        { width: size, height: size },
      ]}
    >
      <PinchGestureHandler
        ref={pinchRef}
        enabled={enabled}
        onGestureEvent={onPinchGesture}
        onHandlerStateChange={onPinchStateChange}
        simultaneousHandlers={panRef}
      >
        <Animated.View style={{ flex: 1 }}>
          <PanGestureHandler
            ref={panRef}
            enabled={panEnabled}
            minPointers={panMinPointers ?? 2} // ✅ default 2, sonst klaut es dem Pager
            onGestureEvent={onPanGesture}
            onHandlerStateChange={onPanStateChange}
            simultaneousHandlers={pinchRef}
          >
            <Animated.View style={{ flex: 1 }}>
              <View style={s.center}>
                <Animated.View
                  style={{
                    width: base.w,
                    height: base.h,
                    transform: [
                      { translateX: panX },
                      { translateY: panY },
                      { scale: scaleA },
                    ],
                  }}
                >
                  {children}
                </Animated.View>
              </View>

              {(showGrid || gestureActive) && (
                <View pointerEvents="none" style={s.gridWrap}>
                  <View style={s.gridLineH1} />
                  <View style={s.gridLineH2} />
                  <View style={s.gridLineV1} />
                  <View style={s.gridLineV2} />
                  <View style={s.gridBorder} />
                  <View style={s.gridHint}>
                    <Text style={s.gridHintTxt}>{t("alignablesquare.alignTwoFingers")}</Text>
                  </View>
                </View>
              )}
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </PinchGestureHandler>
    </View>
  );
}

/* ---------- Styles ---------- */
const s = StyleSheet.create({
  square: {
    backgroundColor: "#000",
  },
  // ✅ wichtig: beim Baking KEIN overflow hidden + radius,
  // sonst brennst du runde Ecken ins JPG ein.
  rounded: {
    overflow: "hidden",
    borderRadius: 14,
  },
  notRounded: {
    overflow: "hidden", // viewport soll clippen
    borderRadius: 0,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  gridWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  gridBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  gridLineH1: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "33.333%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  gridLineH2: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "66.666%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  gridLineV1: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "33.333%",
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  gridLineV2: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "66.666%",
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.22)",
  },

  gridHint: {
    position: "absolute",
    right: 10,
    top: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  gridHintTxt: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
