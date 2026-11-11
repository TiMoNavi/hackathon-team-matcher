// apps/ciaorelated/src/screens/create/post/components/CropStage.tsx
// Unified pan+zoom crop stage with aspect ratio support.
// Renders content inside a square viewport (W x W) but the crop frame can be non-square (original/4:5/16:9/1:1).

import React, { useEffect, useMemo } from "react";
import { View, StyleSheet, LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

const wClamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type AspectKey = "ORIGINAL" | "1:1" | "4:5" | "16:9";
export type CropState = { scale: number; tx: number; ty: number; aspect: AspectKey };

export const DEFAULT_CROP: CropState = { scale: 1, tx: 0, ty: 0, aspect: "ORIGINAL" };

function aspectToRatio(aspect: AspectKey, originalRatio: number) {
  if (aspect === "ORIGINAL") return originalRatio || 1;
  if (aspect === "1:1") return 1;
  if (aspect === "4:5") return 4 / 5;
  return 16 / 9;
}

/**
 * Fits a (ratio=w/h) frame INSIDE a square viewport (size x size).
 */
function fitFrameInSquare(size: number, ratio: number) {
  const r = ratio || 1;
  if (r >= 1) {
    // landscape-ish: full width
    return { frameW: size, frameH: size / r, offX: 0, offY: (size - size / r) / 2 };
  }
  // portrait-ish: full height
  return { frameW: size * r, frameH: size, offX: (size - size * r) / 2, offY: 0 };
}

export function CropStage({
  crop,
  onChange,
  enabled = true,
  onStart,
  onEnd,
  viewportSize,
  mediaW,
  mediaH,
  children,
}: {
  crop: CropState;
  onChange: (c: CropState) => void;
  enabled?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  viewportSize: number; // square size (usually screen width)
  mediaW: number;
  mediaH: number;
  children: React.ReactNode;
}) {
  const originalRatio = useMemo(() => (mediaW > 0 && mediaH > 0 ? mediaW / mediaH : 1), [mediaW, mediaH]);
  const targetRatio = useMemo(() => aspectToRatio(crop.aspect, originalRatio), [crop.aspect, originalRatio]);
  const { frameW, frameH, offX, offY } = useMemo(() => fitFrameInSquare(viewportSize, targetRatio), [viewportSize, targetRatio]);

  // baseScale covers the crop frame.
  const baseScale = useMemo(() => {
    if (!mediaW || !mediaH) return 1;
    const sx = frameW / mediaW;
    const sy = frameH / mediaH;
    return Math.max(sx, sy);
  }, [frameW, frameH, mediaW, mediaH]);

  // live values
  const scale = useSharedValue(crop.scale ?? 1);
  const tx = useSharedValue(crop.tx ?? 0);
  const ty = useSharedValue(crop.ty ?? 0);

  // start values
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // keep in sync when parent swaps items
  useEffect(() => {
    scale.value = crop.scale ?? 1;
    tx.value = crop.tx ?? 0;
    ty.value = crop.ty ?? 0;
  }, [crop.scale, crop.tx, crop.ty, crop.aspect]);

  const getBounds = () => {
    "worklet";
    const s = Math.max(1, scale.value);
    const scaledW = mediaW * baseScale * s;
    const scaledH = mediaH * baseScale * s;
    const maxX = Math.max(0, (scaledW - frameW) / 2);
    const maxY = Math.max(0, (scaledH - frameH) / 2);
    return { maxX, maxY };
  };

  const commit = () => {
    onChange({ ...crop, scale: scale.value, tx: tx.value, ty: ty.value });
  };

  const pinch = Gesture.Pinch()
    .enabled(enabled)
    .onBegin(() => {
      startScale.value = scale.value;
      if (onStart) runOnJS(onStart)();
    })
    .onUpdate((e) => {
      const next = startScale.value * e.scale;
      scale.value = wClamp(next, 1, 6);
      const { maxX, maxY } = getBounds();
      tx.value = wClamp(tx.value, -maxX, maxX);
      ty.value = wClamp(ty.value, -maxY, maxY);
    })
    .onEnd(() => {
      runOnJS(commit)();
      if (onEnd) runOnJS(onEnd)();
    });

  const pan = Gesture.Pan()
    .enabled(enabled)
    .onBegin(() => {
      startX.value = tx.value;
      startY.value = ty.value;
      if (onStart) runOnJS(onStart)();
    })
    .onUpdate((e) => {
      const { maxX, maxY } = getBounds();
      tx.value = wClamp(startX.value + e.translationX, -maxX, maxX);
      ty.value = wClamp(startY.value + e.translationY, -maxY, maxY);
    })
    .onEnd(() => {
      runOnJS(commit)();
      if (onEnd) runOnJS(onEnd)();
    });

  const g = Gesture.Simultaneous(pinch, pan);

  const aStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: baseScale * Math.max(1, scale.value) },
    ],
  }));

  // For ViewShot on Android we want a stable layout tree.
  const onLayout = (_e: LayoutChangeEvent) => {
    // no-op; kept for future extension
  };

  return (
    <View style={[styles.viewport, { width: viewportSize, height: viewportSize }]} onLayout={onLayout} collapsable={false}>
      <View style={[styles.frame, { width: frameW, height: frameH, left: offX, top: offY }]} pointerEvents="none" />
      <GestureDetector gesture={g}>
        <View
          style={[styles.clip, { width: frameW, height: frameH, left: offX, top: offY }]}
          pointerEvents={enabled ? "auto" : "none"}
          collapsable={false}
        >
          <Animated.View style={[{ width: mediaW, height: mediaH }, aStyle]}>{children}</Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    backgroundColor: "#000",
  },
  clip: {
    position: "absolute",
    overflow: "hidden",
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    position: "absolute",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#0000", // invisible; we keep it for debugging if needed.
  },
});
